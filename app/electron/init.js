'use strict';

const path = require('path');
const { app } = require('electron');
app.setName('Achievement Watcher');
app.setPath('userData', path.join(app.getPath('appData'), app.getName()));
const CHROMIUM_REVISION = '1108766';
const { BrowserWindow, dialog, session, shell, ipcMain, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
autoUpdater.autoInstallOnAppQuit = false;
const remote = require('@electron/remote/main');
remote.initialize();
const minimist = require('minimist');
const { XMLParser } = require('fast-xml-parser');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const semver = require('semver');
const ipc = require(path.join(__dirname, 'ipc.js'));
const player = require('sound-play');
const { fetchIcon } = require(path.join(__dirname, '../parser/steam.js'));
const { pathToFileURL } = require('url');
const fetch = require('node-fetch');
const BASE_URL = 'https://www.steamgriddb.com/api/v2';
const API_KEY = '2a9d32ddd0bfe4e1191b4f6ff56fef60'; // TODO: remove this and load from config file

let client; //lazyload SteamUser
let clientLoginPromise;

function clientLogOn() {
  const SteamUser = require('steam-user');
  if (!client) client = new SteamUser();
  if (client.steamID) return Promise.resolve();
  if (clientLoginPromise) return clientLoginPromise;
  clientLoginPromise = new Promise((resolve) => {
    client.logOn({ anonymous: true });
    client.on('loggedOn', () => {
      clientLoginPromise = null;
      resolve();
    });
  });
  return clientLoginPromise;
}

const manifest = require('../package.json');
const userData = app.getPath('userData');
let currentlyscraping = { steamcommunity: false, steamhunters: false };
let settingsJS = null;
let configJS = null;
let achievementsJS = null;

if (manifest.config['disable-gpu']) app.disableHardwareAcceleration();
if (manifest.config.appid) app.setAppUserModelId(manifest.config.appid);
manifest.config.debug = process.env.NODE_ENV === 'development' || process.defaultApp || /[\\/]electron/.test(process.execPath);

let puppeteerWindow = {};
let MainWin = null;
let progressWindow = null;
let overlayWindow = null;
let playtimeWindow = null;
let notificationWindow = null;
let isplaytimeWindowShowing = false;
let isNotificationShowing = false;
let isProgressWindowShowing = false;
let isOverlayShowing = false;
const earnedNotificationQueue = [];
const playtimeQueue = [];
const progressQueue = [];
let debug = new (require('@xan105/log'))({
  console: manifest.config.debug || false,
  file: path.join(userData, `logs/renderer.log`),
});

async function getUserAchievements(appid) {
  let steamid = 76561198152618007;
  //TODO: this can be used to get descriptions in other languagues
  // append to url -> ?l=<languague> - like english/french/etc
  const url = `https://steamcommunity.com/profiles/${steamid}`;
  const res = await fetch(url, { redirect: 'manual', headers: { userAgent: 'node-fecth' } });
  const l = res.headers.get('location');
  const data = await res.json();

  if (!data.playerstats || !data.playerstats.achievements) {
    throw new Error('No achievements found or stats are private');
  }

  return data.playerstats.achievements.map((a) => ({
    apiName: a.apiname,
    unlocked: a.achieved === 1,
    name: a.name,
    description: a.description,
    unlockTime: a.unlocktime,
  }));
}

const steamUserIds = [
  '76561198028121353',
  '76561197979911851',
  '76561198017975643',
  '76561197993544755',
  '76561198355953202',
  '76561198001237877',
  '76561198237402290',
  '76561198152618007',
  '76561198355625888',
  '76561198213148949',
  '76561197969050296',
  '76561198217186687',
  '76561198037867621',
  '76561198094227663',
  '76561198019712127',
  '76561197963550511',
  '76561198134044398',
  '76561198001678750',
  '76561197973009892',
  '76561198044596404',
  '76561197976597747',
  '76561197969810632',
  '76561198095049646',
  '76561198085065107',
  '76561198864213876',
  '76561197962473290',
  '76561198388522904',
  '76561198033715344',
  '76561197995070100',
  '76561198313790296',
  '76561198063574735',
  '76561197996432822',
  '76561197976968076',
  '76561198281128349',
  '76561198154462478',
  '76561198027233260',
  '76561198842864763',
  '76561198010615256',
  '76561198035900006',
  '76561198122859224',
  '76561198235911884',
  '76561198027214426',
  '76561197970825215',
  '76561197968410781',
  '76561198104323854',
  '76561198001221571',
  '76561198256917957',
  '76561198008181611',
  '76561198407953371',
  '76561198062901118',
  '76561197979667190',
  '76561197974742349',
  '76561198077213101',
  '76561198121398682',
  '76561198019009765',
  '76561198119667710',
  '76561197990233857',
  '76561199130977924',
  '76561198096081579',
  '76561198139084236',
  '76561197971011821',
  '76561198063728345',
  '76561198082995144',
  '76561197963534359',
  '76561198118726910',
  '76561198097945516',
  '76561198124872187',
  '76561198077248235',
  '76561198326510209',
  '76561198109083829',
  '76561198808371265',
  '76561198048373585',
  '76561198005337430',
  '76561198045455280',
  '76561197981111953',
  '76561197992133229',
  '76561198152760885',
  '76561198037809069',
  '76561198382166453',
  '76561198093753361',
  '76561198396723427',
  '76561199168919006',
  '76561198006391846',
  '76561198040421250',
  '76561197994616562',
  '76561198017902347',
  '76561198044387084',
  '76561198172367910',
  '76561199353305847',
  '76561198121336040',
  '76561197972951657',
  '76561198251835488',
  '76561198102767019',
  '76561198021180815',
  '76561197976796589',
  '76561197992548975',
  '76561198367471798',
  '76561197965978376',
  '76561197993312863',
  '76561198128158703',
  '76561198015685843',
  '76561198047438206',
  '76561197971026489',
  '76561198252374474',
  '76561198061393233',
  '76561199173688191',
  '76561198008797636',
  '76561197995008105',
  '76561197984235967',
  '76561198417144062',
  '76561197978640923',
  '76561198219343843',
  '76561197982718230',
  '76561198031837797',
  '76561198039492467',
  '76561198020125851',
  '76561198192399786',
  '76561198028011423',
  '76561198318111105',
  '76561198155124847',
  '76561198168877244',
  '76561198105279930',
  '76561197988664525',
  '76561198996604130',
  '76561197969148931',
  '76561198035552258',
  '76561198015992850',
  '76561198050474710',
  '76561198029503957',
  '76561198026221141',
  '76561198025653291',
  '76561198034213886',
  '76561198096632451',
  '76561197972378106',
  '76561197997477460',
  '76561198054210948',
  '76561198111433283',
  '76561198004332929',
  '76561198045540632',
  '76561198043532513',
  '76561199080934614',
  '76561197970246998',
  '76561197986240493',
  '76561198029532782',
  '76561198018254158',
  '76561197973230221',
  '76561198020746864',
  '76561198158932704',
  '76561198086250077',
  '76561198269242105',
  '76561198294806446',
  '76561198031164839',
  '76561198019555404',
  '76561198048151962',
  '76561198003041763',
  '76561198025391492',
  '76561197962630138',
  '76561198072936438',
  '76561198120120943',
  '76561197984010356',
  '76561198042965266',
  '76561198046642155',
  '76561198015856631',
  '76561198124865933',
  '76561198042781427',
  '76561198443388781',
  '76561198426000196',
  '76561198051725954',
  '76561197992105918',
  '76561198172925593',
  '76561198071709714',
  '76561197981228012',
  '76561197981027062',
  '76561198122276418',
  '76561198019841907',
  '76561197985091630',
  '76561199492215670',
  '76561198106206019',
  '76561198090111762',
  '76561198104561325',
  '76561197991699268',
  '76561198072361453',
  '76561198027066612',
  '76561198032614383',
  '76561198844130640',
  '76561198106145311',
  '76561198079227501',
  '76561198093579202',
  '76561198315929726',
  '76561198171791210',
  '76561198264362271',
  '76561198846208086',
  '76561197991613008',
  '76561198026306582',
  '76561197973701057',
  '76561198028428529',
  '76561198427572372',
  '76561197983517848',
  '76561198085238363',
  '76561198070220549',
  '76561198101049562',
  '76561197969365800',
  '76561198413266831',
  '76561198015514779',
  '76561198811114019',
  '76561198165450871',
  '76561197994575642',
  '76561198034906703',
  '76561198119915053',
  '76561198079896896',
  '76561198008549198',
  '76561197988052802',
  '76561198004532679',
  '76561198002535276',
  '76561197970545939',
  '76561197977920776',
  '76561198007200913',
  '76561197984605215',
  '76561198831075066',
  '76561197970970678',
  '76561197982273259',
  '76561197970307937',
  '76561198413088851',
  '76561197970360549',
  '76561198051740093',
  '76561197966617426',
  '76561198356842617',
  '76561198025111129',
  '76561197996825541',
  '76561197967716198',
  '76561197975329196',
  '76561197998058239',
  '76561198027668357',
  '76561197962850521',
  '76561198258304011',
  '76561198098314980',
  '76561198127957838',
  '76561198060520130',
  '76561198035612474',
  '76561198318547224',
  '76561198020810038',
  '76561198080773680',
  '76561198033967307',
  '76561198034503074',
  '76561198150467988',
  '76561197994153029',
  '76561198026278913',
  '76561198217979953',
  '76561197988445370',
  '76561198083977059',
];

async function getSteamData(request) {
  const appid = request.appid;
  const type = request.type;
  let user = request.user;
  let userid;
  const lang = request.lang || 'english';
  try {
    if (type === 'user') {
      const url = `https://steamcommunity.com/profiles/${user}/stats/${appid}/?xml=1`;
      const res = await fetch(url);
      const xml = await res.text();
      const parser = new XMLParser({ ignoreAttributes: false, allowBooleanAttributes: true, cdataPropName: '__cdata' });
      const data = parser.parse(xml);
      const achievements = data?.playerstats?.achievements?.achievement || [];
      const list = Array.isArray(achievements) ? achievements : [achievements];

      return list.map((a) => {
        const name = a.apiname?.__cdata || a.apiname || '';
        const unlock = parseInt(a.unlockTimestamp ?? 0);
        return {
          apiname: name,
          achieved: unlock > 0 ? 1 : 0,
          unlocktime: unlock || 0,
        };
      });
    }
    if (type === 'steamcommunity') {
      let info = { appid };
      const url = `https://steamcommunity.com/stats/${appid}/achievements?l=${lang.api}`; //this doesnt give hidden descriptions
      await scrapeWithPuppeteer(info, { steamcommunity: true, url: url });
      currentlyscraping.steamcommunity = false;
      if (info.achievements.every((a) => a.description)) {
        return info;
      }

      let validXml = false;
      let xml;

      //instead of looping steamuserids,
      //lets get users from steamhunters and try those

      await scrapeWithPuppeteer(info, { userlist: true, steamhunters: true, appid });
      currentlyscraping.steamhunters = false;
      let u = info.users.map((user) => user.steamId);

      for (let id of u) {
        userid = id;
        const url = `https://steamcommunity.com/profiles/${userid}/stats/${appid}/?xml=1`; // this for all data
        const res = await fetch(url);
        xml = await res.text();
        validXml = !(xml.startsWith('<!DOCTYPE html') || xml.includes('<html'));
        if (!validXml) continue;

        const parser = new XMLParser({ ignoreAttributes: false, allowBooleanAttributes: true, cdataPropName: '__cdata' });
        const data = parser.parse(xml);
        const achievements = data?.playerstats?.achievements?.achievement || [];
        const list = achievements.map((a) => {
          const unlocked = a['@_closed'] === '1';
          const name = a.name.__cdata;
          const description = a.description.__cdata;
          return { name, description, unlocked };
        });
        const allgood = list.every((a) => a.description);
        if (!allgood) continue;
        const url2 = `https://steamcommunity.com/profiles/${userid}/stats/${appid}?l=${lang.api}`; // this for name and description, match them via icon hash
        await scrapeWithPuppeteer(info, { steamcommunity: true, url: url2 });
        currentlyscraping.steamcommunity = false;
        return info;
      }
      // TODO: fallback to steamuserids if noone on steamhunters has 100% the game
      return info;
    }

    if (type === 'data') {
      let info = { appid };
      await scrapeWithPuppeteer(info, { steamhunters: true });
      currentlyscraping.steamhunters = false;
      while (!info.achievements) {
        await delay(500);
      }
      return info;
    }
    if (type === 'steamhunters') {
      let info = { appid };
      await scrapeWithPuppeteer(info, { steamhunters: true });
      currentlyscraping.steamhunters = false;
      return info;
    }
    await clientLogOn();
    const storeURL = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`;
    const storeRes = await fetch(storeURL);
    const json = await storeRes.json();
    const storeData = json[appid] && json[appid].data;
    const { apps, packages, unknownApps, unknownPackages } = await client.getProductInfo([appid], [], false);
    const appInfo = apps[appid]?.appinfo || apps[0]?.appinfo;

    switch (type) {
      case 'name':
        return appInfo?.common?.name;

      case 'header':
        return (
          appInfo.common.header_image?.[lang.api] ||
          appInfo.common.library_assets_full?.library_header?.image[lang.api] ||
          appInfo.common.header_image.english ||
          appInfo.common.library_assets_full?.library_header?.image?.english
        );
      case 'icon':
        return appInfo.common.icon;
      case 'portrait':
        return (
          appInfo.common.library_assets_full?.library_capsule?.image[lang] || appInfo.common.library_assets_full?.library_capsule?.image?.english
        );
      default:
      case 'common':
        return {
          name: appInfo.common.name,
          isGame: appInfo?.common?.type?.toLowerCase() === 'game',
          translated: appInfo?.common?.languages?.[lang.api] || false,
          icon: appInfo.common.icon,
          header:
            appInfo.common.header_image?.[lang.api] ||
            appInfo.common.library_assets_full?.library_header?.image?.[lang.api] ||
            appInfo.common.header_image?.english ||
            appInfo.common.library_assets_full?.library_header?.image?.english ||
            storeData?.header_image,
          portrait:
            appInfo.common.library_assets_full?.library_capsule?.image?.[lang.api] ||
            appInfo.common.library_assets_full?.library_capsule?.image?.english,
          background: storeData?.background.replace(/(\?|&)t=\d+$/, ''),
        };
    }

    await delay(1000);
  } catch (err) {
    debug.log(err);
  }
  return {};
}

async function closePuppeteer() {
  currentlyscraping.steamcommunity = false;
  currentlyscraping.steamhunters = false;
  if (!puppeteerWindow) puppeteerWindow = {};
  if (puppeteerWindow.context) await puppeteerWindow.context.close();
  if (puppeteerWindow.browser) await puppeteerWindow.browser.close();
  puppeteerWindow.browser = undefined;
  puppeteerWindow.pagesh = undefined;
  puppeteerWindow.pagesc = undefined;
  puppeteerWindow.context = undefined;
}

async function startEngines() {
  if (!settingsJS) {
    settingsJS = require(path.join(__dirname, '../settings.js'));
    settingsJS.setUserDataPath(userData);
  }
  configJS = await settingsJS.load();
  if (!achievementsJS) {
    achievementsJS = require(path.join(__dirname, '../parser/achievements.js'));
    achievementsJS.initDebug({ isDev: app.isDev || false, userDataPath: userData });
  }
}

async function getCachedData(info) {
  if (!info.source) info.source = 'steam';
  let g = await achievementsJS.getGameFromCache(info.appid, info.source, configJS);
  switch (info.source.toLowerCase()) {
    case 'epic':
    case 'gog':
    case 'luma':
    case 'steam':
    default:
      if (g) {
        info.a = g.achievement.list.find((ac) => ac.name === String(info.ach));
        info.game = g;
        info.description = info.a?.displayName;
        return;
      }
      const [data, com] = await Promise.all([
        getSteamData({ appid: info.appid, type: 'steamhunters' }),
        getSteamData({ appid: info.appid, type: 'common' }),
      ]);
      info.game = com;
      info.game.achievements = data.achievements;

      await achievementsJS.saveGameToCache(info, configJS.achievement.lang);
      info.a = info.game.achievements.find((ac) => ac.name === String(info.ach));
      info.description = info.a?.displayName;
  }
}

ipcMain.on('capture-screen', async (event, { image, game, name }) => {
  function sanitizeName(name) {
    // Remove invalid characters
    name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
    // Remove trailing spaces or dots
    name = name.replace(/[. ]+$/, '');
    // Trim just in case
    return name.trim();
  }
  if (!configJS.souvenir_screenshot.screenshot || manifest.config.debug) return;
  const buffer = Buffer.from(image, 'base64');
  const savePath = path.join(configJS.souvenir_screenshot.custom_dir || app.getPath('pictures'), sanitizeName(game), sanitizeName(name) + '.png');
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  if (!configJS.souvenir_screenshot.overwrite_image && fs.existsSync(savePath)) return;
  fs.writeFileSync(savePath, buffer);
});

ipcMain.on('close-puppeteer', async (event, arg) => {
  await closePuppeteer();
  event.returnValue = true;
});

ipcMain.on('get-steam-data', async (event, arg) => {
  const appid = +arg.appid;
  event.returnValue = await getSteamData({ appid, type: arg.type, user: arg.user, lang: arg.lang });
});

ipcMain.on('get-steam-appid-from-title', async (event, arg) => {
  function normalizeTitle(str) {
    return str
      .toLowerCase()
      .normalize('NFKD') // normalize accents
      .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A']/g, '') // single quotes
      .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB"]/g, '') // double quotes
      .replace(/[™®©]/g, '') // trademark symbols
      .replace(/[:.,!?()\\[\\]{}\-]/g, '') // punctuation + hyphens
      .replace(/\s+/g, ' ') // collapse spaces
      .trim();
  }

  let info = { name: arg.title };
  searchForSteamAppId(info);
  let possibleMatch;
  while (true) {
    if (info.games) {
      for (let game of info.games) {
        if (normalizeTitle(game.title) === normalizeTitle(arg.title)) {
          event.returnValue = game.appid;
          return;
        }
        if (!possibleMatch && normalizeTitle(game.title).includes(normalizeTitle(arg.title))) {
          possibleMatch = game.appid;
        }
      }
      break;
    }
    await delay(500);
  }
  event.returnValue = possibleMatch;
});

ipcMain.on('get-title-from-epic-id', async (event, arg) => {
  let info = { appid: arg.appid };
  await searchForGameName(info);
  while (true) {
    if (info.title) {
      event.returnValue = info.title;
      return;
    }
    await delay(500);
  }
});

ipcMain.on('get-images-for-game', async (event, arg) => {
  const gameName = arg.name;
  try {
    const searchRes = await fetch(`${BASE_URL}/search/autocomplete/${encodeURIComponent(gameName)}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    const searchData = await searchRes.json();
    const game = searchData.data[0];
    if (!game) {
      debug.log('Game not found');
      return;
    }

    const gameId = game.id;

    const [iconsRes, gridsRes, heroesRes, logosRes] = await Promise.all([
      fetch(`${BASE_URL}/icons/game/${gameId}`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${BASE_URL}/grids/game/${gameId}`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${BASE_URL}/heroes/game/${gameId}`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${BASE_URL}/logos/game/${gameId}`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);

    const [icons, grids, heroes, logos] = await Promise.all([iconsRes.json(), gridsRes.json(), heroesRes.json(), logosRes.json()]);

    const portrait = grids.data.find((g) => g.width === 600 && g.height === 900);
    const landscape = grids.data.find((g) => g.width === 920 && g.height === 430);
    const links = {
      icon: icons.data?.[0]?.url || logos.data?.[0]?.url,
      background: heroes.data?.[0]?.url,
      portrait: portrait?.url,
      landscape: landscape?.url,
    };
    event.returnValue = links;
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
});

ipcMain.on('stylize-background-for-appid', async (event, arg) => {
  const imageUrl = arg.background;
  const t = path.parse(imageUrl).base;
  const outputPath = path.join(app.getPath('userData'), 'steam_cache', 'icon', arg.appid, t);
  const sharp = require('sharp');

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    const buffer = await res.buffer();

    const metadata = await sharp(buffer).metadata();
    const { width, height } = metadata;

    const processedBuffer = await sharp(buffer)
      .blur(5)
      .modulate({ saturarion: 0.5 })
      .composite([
        {
          input: Buffer.from(
            `<svg width="${width}" height="${height}">
              <rect width="100%" height="100%" fill="#3b65a7" fill-opacity="0.8"/>
              <rect width="100%" height="100%" fill="#000000" fill-opacity="0.4"/>
             </svg>`
          ),
          blend: 'over',
        },
      ])
      .toBuffer();
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, processedBuffer);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
});

ipcMain.on('fetch-source-img', async (event, arg) => {
  switch (arg) {
    case 'epic':
      event.returnValue = path.join(process.env['APPDATA'], 'Achievement Watcher', 'Source', 'epic.svg');
      break;
    case 'gog':
      event.returnValue = path.join(process.env['APPDATA'], 'Achievement Watcher', 'Source', 'gog.svg');
      break;
    case 'RPCS3 Emulator':
      event.returnValue = path.join(process.env['APPDATA'], 'Achievement Watcher', 'Source', 'playstation.svg');
      break;
    case 'steam':
    default:
      event.returnValue = path.join(process.env['APPDATA'], 'Achievement Watcher', 'Source', 'steam.svg');
      break;
  }
});

ipcMain.on('notify-test', async (event, arg) => {
  await createNotificationWindow({ appid: 400, ach: 'PORTAL_TRANSMISSION_RECEIVED' });
});

ipcMain.on('playtime-test', async (event, arg) => {
  await createPlaytimeWindow({ appid: 400, description: 'Testing notification' });
});
ipcMain.on('progress-test', async (event, arg) => {
  await createProgressWindow({ appid: 400, ach: 'PORTAL_TRANSMISSION_RECEIVED', description: 'Testing progress', count: '50/100' });
});

ipcMain.on('achievement-data-ready', () => {
  progressWindow.showInactive();
});

ipcMain.handle('get-achievements', async (event, appid) => {
  return await getSteamData({ appid, type: 'steamhunters' });
});

ipcMain.handle('start-watchdog', async (event, arg) => {
  event.sender.send('reset-watchdog-status');
  const wd = spawn(
    path.join(manifest.config.debug ? path.join(__dirname, '../../') : path.dirname(process.execPath), 'nw/nw.exe'),
    ['-config', 'watchdog.json'],
    {
      cwd: path.join(manifest.config.debug ? path.join(__dirname, '../../') : path.dirname(process.execPath), 'nw/'),
      detached: true,
      stdio: 'ignore',
      shell: false,
    }
  );
  wd.unref(); // Let it run independently
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureChromium() {
  const { BrowserFetcher } = require('puppeteer');
  const chromium = path.join(process.env['APPDATA'], 'Achievement Watcher', 'Chromium');
  const fetcher = new BrowserFetcher({ path: chromium });
  const revisionInfo = fetcher.revisionInfo(CHROMIUM_REVISION);
  if (revisionInfo.local) return revisionInfo;
  const info = await fetcher.download(CHROMIUM_REVISION);
  return info;
}

async function startPuppeteer(headless, strip) {
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
  const ChromeLauncher = require('chrome-launcher');
  const installedChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' || ChromeLauncher.Launcher.getInstallations()[0];
  const chromiumPath = fs.existsSync(installedChromePath) ? installedChromePath : (await ensureChromium()).executablePath;
  if (!puppeteerWindow.browser)
    puppeteerWindow.browser = await puppeteer.launch({
      headless: headless ? 'new' : false,
      executablePath: chromiumPath,
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-extensions'],
    });
  if (!puppeteerWindow.context) puppeteerWindow.context = await puppeteerWindow.browser.createIncognitoBrowserContext();
  if (!puppeteerWindow.pagesc) {
    puppeteerWindow.pagesc = await puppeteerWindow.context.newPage();
  }
  if (!puppeteerWindow.pagesh) {
    puppeteerWindow.pagesh = await puppeteerWindow.context.newPage();
    if (strip) {
      const page = puppeteerWindow.pagesh;
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });
    }
  }
}

async function scrapeWithPuppeteer(info = { appid: 269770 }, alternate) {
  if (alternate?.steamhunters || alternate?.steamcommunity)
    while ((currentlyscraping.steamhunters && alternate?.steamhunters) || (currentlyscraping.steamcommunity && alternate?.steamcommunity)) delay(100);
  currentlyscraping.steamcommunity = alternate?.steamcommunity ? true : currentlyscraping.steamcommunity;
  currentlyscraping.steamhunters = alternate?.steamhunters ? true : currentlyscraping.steamhunters;
  await startPuppeteer(alternate, alternate?.steamhunters);
  try {
    if (alternate) {
      if (alternate.steamhunters) {
        if (alternate.userlist) {
          const url = `https://steamhunters.com/apps/${info.appid}/users?sort=completionstate`;
          const page = puppeteerWindow.pagesh;
          try {
            await page.goto(url);
            await page.waitForFunction(() => {
              return Array.from(document.querySelectorAll('script')).some((s) => s.textContent.includes('var sh'));
            });
            await page.evaluate(() => {
              const scripts = Array.from(document.querySelectorAll('script'));
              const target = scripts.find((s) => s.textContent.includes('var sh'));
              eval(target.textContent);
            });
            const users = (await page.evaluate(() => sh.model.listData.pagedList.items)) || [];

            const results = [];
            users.forEach((item) => {
              results.push({
                id: item.steamId,
                isPublic: item.privacyState === 0,
              });
            });
            info.users = users;
          } catch (e) {
            debug.log(e);
          }
          return;
        }
        let start = Date.now();
        const url = `https://steamhunters.com/apps/${info.appid}/achievements?group=&sort=name`;
        const page = puppeteerWindow.pagesh;
        try {
          await page.goto(url);
          await page.waitForFunction(() => {
            return Array.from(document.querySelectorAll('script')).some((s) => s.textContent.includes('var sh'));
          });
          await page.evaluate(() => {
            const scripts = Array.from(document.querySelectorAll('script'));
            const target = scripts.find((s) => s.textContent.includes('var sh'));
            eval(target.textContent);
          });
          const achievements = (await page.evaluate(() => sh.model.listData.pagedList.items)) || [];

          const results = [];
          achievements.forEach((item) => {
            results.push({
              name: item.apiName,
              default_value: 0,
              displayName: item.name,
              hidden: item.hidden ? 1 : 0,
              description: item.description || ' ',
              icon: item.icon,
              icongray: item.iconGray,
            });
          });
          info.achievements = results;
          debug.log(`[${info.appid}] steamhunters took ${(Date.now() - start) / 1000}s`);
        } catch (e) {
          debug.log(e);
        }
        return;
      }

      if (alternate.steamcommunity) {
        const page = puppeteerWindow.pagesc;
        try {
          await page.goto(alternate.url, { waitUntil: 'domcontentloaded' });
        } catch (e) {
          debug.log(e);
        }
        const achs = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('.achieveRow')).map((row) => {
            const img = row.querySelector('.achieveImgHolder img')?.src.split('/').pop().split('.jpg')[0] || null;
            const title = row.querySelector('.achieveTxt h3')?.innerText.trim() || null;
            const description = row.querySelector('.achieveTxt h5')?.innerText.trim() || null;
            return { img, title, description };
          });
        });
        info.achievements = achs;
        return;
      }

      const url = `https://steamcommunity.com/profiles/${alternate.steamid}`;
      const page = puppeteerWindow.page;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
      } catch (e) {
        debug.log(e);
      }
      const url3 = page.url();
      await page.goto(`${url3}/stats/${info.appid}/?tab=achievements`, { waitUntil: 'domcontentloaded' });
      return;
    }
    const url1 = `https://steamdb.info/app/${info.appid}/info/`;
    const url2 = `https://steamdb.info/app/${info.appid}/stats/`;
    const page2 = puppeteerWindow.page;

    await page2.goto(url2, { waitUntil: 'domcontentloaded' });
    const pageText = await page2.evaluate(() => document.body.innerText || '');
    if (pageText.includes('No app was found matching this AppID')) {
      info.achievements = [];
      return;
    }
    if (!page2.url().includes('/stats')) {
      info.achievements = [];
      return;
    }
    info.name = await page2.evaluate(() => {
      const el = document.querySelector('.pagehead-title h1');
      return el?.innerText.trim() || null;
    });
    await page2.waitForSelector('.achievements_list', { timeout: 5000 }).catch(() => {
      throw new Error('Achievements list container not found');
    });
    // Get achievements
    info.achievements = await page2.evaluate(() => {
      const items = document.querySelectorAll('.achievements_list .achievement');
      const data = [];

      const appid = document.querySelector('.row.app-row table tbody tr')?.children?.[1]?.innerText.trim() || '';

      items.forEach((item) => {
        const idRaw = item.getAttribute('id') || '';
        const id = idRaw.replace(/^achievement-/, '');
        const name = item.querySelector('.achievement_name')?.innerText.trim() || '';

        const descContainer = item.querySelector('.achievement_desc');
        const spoiler = descContainer?.querySelector('.achievement_spoiler');
        const hidden = !!spoiler;
        const description = hidden ? spoiler?.innerText.trim() : descContainer?.innerText.trim() || '';

        const icon = appid
          ? 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/' +
            appid +
            '/' +
            (item.querySelector('.achievement_image')?.getAttribute('data-name') || '')
          : '';

        const icongray = appid
          ? 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/' +
            appid +
            '/' +
            (item.querySelector('.achievement_image_small')?.getAttribute('data-name') || '')
          : '';

        data.push({
          name: id,
          default_value: 0,
          displayName: name,
          hidden: hidden ? 1 : 0,
          description,
          icon,
          icongray,
        });
      });

      return data;
    });
    await delay(Math.floor(Math.random() * (1500 - 800 + 1)) + 800);

    await page2.goto(url1, { waitUntil: 'domcontentloaded' });
    info.icon = await page2.evaluate(() => {
      const el = document.querySelector('#js-assets-table');
      const row = Array.from(el.rows).find((r) => r.cells[0].textContent.trim() === 'icon');

      if (row) {
        return row.cells[1].querySelector('a').textContent.trim();
      }
    });
    return;
  } catch (err) {
    debug.log(err);
  }
}

async function searchForGameName(info = { appid: '' }) {
  if (info.appid.length === 0) {
    info.title = undefined;
    return;
  }

  let locale = 'en-US'; // use AW's languague in the future? does it even make a difference in this context?
  let startIndex = 0;
  let matchResult;
  await startPuppeteer(true, false);

  async function scrapePage(startIndex) {
    const page = await puppeteerWindow.context.newPage();

    const url = `https://store.epicgames.com/pt/browse?sortBy=releaseDate&sortDir=DESC&tag=Windows&priceTier=tier3&category=Game&count=40&start=${
      40 * startIndex
    }`;

    try {
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
      });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      );
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      await page.waitForFunction(() => !!window.__REACT_QUERY_INITIAL_QUERIES__, { timeout: 15000 });
      const queries = await page.evaluate(() => window.__REACT_QUERY_INITIAL_QUERIES__);
      if (queries.queries) {
        const catalogQuery = queries.queries.find((q) => q?.state?.data?.Catalog?.searchStore?.elements);
        if (catalogQuery) {
          const elements = catalogQuery.state.data.Catalog.searchStore.elements;
          const found = elements.find((el) => el.namespace === info.appid);
          if (found) {
            matchResult = found.title;
          }
        }
      }
    } catch (err) {
      console.error(`❌ Error on page ${startIndex}:`, err.message);
    } finally {
      await page.close();
    }
    return matchResult;
  }

  async function run(start) {
    const tasks = [];
    for (let i = start; i < start + 5; i++) {
      const startIndex = i;
      tasks.push(scrapePage(startIndex));
    }

    await Promise.all(tasks);
  }

  while (!info.title) {
    await run(startIndex);
    info.title = matchResult;
    startIndex += 5;
  }
  return;
}

function searchForSteamAppId(info = { name: '' }) {
  if (info.name.length === 0) {
    info.appid = undefined;
    return;
  }
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36');
  // Inject JS *before* the page starts executing its own scripts
  win.webContents.on('dom-ready', async () => {
    await win.webContents.executeJavaScript(`
      // Override navigator.userAgent
      Object.defineProperty(navigator, 'userAgent', {
        get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
      });

      // Override platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32'
      });

      // Override vendor
      Object.defineProperty(navigator, 'vendor', {
        get: () => 'Google Inc.'
      });

      // Fake Chrome object
      window.chrome = { runtime: {} };
    `);
  });
  //win.loadURL(`https://steamdb.info/search/?a=app&q=${info.name}&type=1&category=0`);
  win.loadURL(`https://store.steampowered.com/search/?term=${info.name}&category1=998&ndl=1`);
  win.webContents.on('did-finish-load', async () => {
    let games = undefined;
    try {
      while (!games) {
        games = await win.webContents.executeJavaScript(`
          (() => {
            const rows = document.querySelectorAll('#search_resultsRows a[data-ds-appid]');
            const list = [];

            for (const row of rows) {
              if (list.length >= 10) break;

              const appid = row.getAttribute('data-ds-appid');
              const title = row.querySelector('.title')?.innerText.trim() || '';

              if (appid && title) {
                list.push({ appid, title });
              }
            }

            return list;
          })();
        `);

        /* // this is for steamdb
        games = await win.webContents.executeJavaScript(`
          (() => {
            const rows = document.querySelectorAll('#table-sortable tbody tr.app');
            const matches = [];
            debug.log(rows);
            rows.forEach(row => {
              const appid = row.getAttribute('data-appid');
              const nameLink = row.querySelector('td:nth-child(3) a');
              const name = nameLink?.innerText.trim();

              if (appid && name) {
                matches.push({ appid, name });
              }
            });

            return matches;
          })();
        `);
        */
        await delay(500);
      }
      info.games = games;
    } catch (error) {
      console.error('Failed to find appid:', error);
    }
  });
}

function createMainWindow() {
  try {
    if (MainWin) {
      if (MainWin.isMinimized()) MainWin.restore();
      MainWin.focus();
      return;
    }
    let options = manifest.config.window;
    options.show = false;
    options.webPreferences = {
      devTools: manifest.config.debug || false,
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: false,
      v8CacheOptions: manifest.config.debug ? 'none' : 'code',
      enableRemoteModule: true,
      backgroundThrottling: false,
    };
    //electron 9 crash if no icon exists to specified path
    try {
      fs.accessSync(options.icon, fs.constants.F_OK);
    } catch {
      delete options.icon;
    }
    //getSteamData({ appid: 2321470, type: 'user' });
    MainWin = new BrowserWindow(options);

    //Frameless
    if (options.frame === false) MainWin.isFrameless = true;

    //Debug tool
    if (manifest.config.debug) {
      MainWin.webContents.openDevTools({ mode: 'undocked' });
      MainWin.isDev = true;
      console.info((({ node, electron, chrome }) => ({ node, electron, chrome }))(process.versions));
      try {
        const contextMenu = require('electron-context-menu')({
          append: (defaultActions, params, browserWindow) => [
            {
              label: 'Reload',
              visible: params,
              click: () => {
                MainWin.reload();
              },
            },
          ],
        });
      } catch (err) {
        dialog.showMessageBoxSync({
          type: 'warning',
          title: 'Context Menu',
          message: 'Failed to initialize context menu.',
          detail: `${err}`,
        });
      }
    }

    //User agent
    MainWin.webContents.userAgent = manifest.config['user-agent'];
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['User-Agent'] = manifest.config['user-agent'];
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    //External open links
    const openExternal = function (event, url) {
      if (!url.startsWith('file:///')) {
        event.preventDefault();
        shell.openExternal(url).catch(() => {});
      }
    };
    MainWin.webContents.on('will-navigate', openExternal); //a href
    MainWin.webContents.on('new-window', openExternal); //a href target="_blank"

    MainWin.loadFile(manifest.config.window.view);

    const isReady = [
      new Promise(function (resolve) {
        MainWin.once('ready-to-show', () => {
          return resolve();
        }); //Window is loaded and ready to be drawn
      }),
      new Promise(function (resolve) {
        ipcMain.handleOnce('components-loaded', () => {
          return resolve();
        }); //Wait for custom event
      }),
    ];

    Promise.all(isReady).then(() => {
      MainWin.show();
      MainWin.focus();
      const net = require('net');
      const PIPE_NAME = '\\\\.\\pipe\\AchievementWatchdogPipe';
      function checkWatchdogStatus(callback) {
        const client = net.createConnection(PIPE_NAME);

        client.on('connect', () => {
          callback(true);
          client.end();
        });

        client.on('error', () => {
          callback(false);
        });
      }
      setInterval(() => {
        checkWatchdogStatus((running) => {
          if (MainWin) MainWin.webContents.send('watchdog-status', running);
        });
      }, 5000);
    });

    MainWin.on('closed', () => {
      MainWin = null;
      if (shouldQuitApp()) app.quit();
    });
  } catch (e) {
    debug.log(`Error creating main window: ${e}`);
    if (shouldQuitApp()) app.quit();
  }
}

/**
 * @param {{appid: string, action:string}} info
 */
async function createOverlayWindow(info) {
  try {
    if (!info.action) info.action = 'open';
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (String(info.appid) === '0' || info.action == 'close') {
        overlayWindow.close();
        return;
      }
      if (info.action === 'refresh') {
        overlayWindow.webContents.send('refresh-achievements-table', String(info.appid));
        return;
      }
    }
    if (String(info.appid) === '0' || info.action === 'refresh') return;
    const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;
    isOverlayShowing = true;

    await startEngines();
    await getCachedData(info);
    info.game = await achievementsJS.getSavedAchievementsForAppid(configJS, { appid: info.appid });

    overlayWindow = new BrowserWindow({
      width: 450,
      height: 800,
      x: width - 470,
      y: 20,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      hasShadow: false,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, '../overlayPreload.js'),
        additionalArguments: [`--isDev=${app.isDev ? 'true' : 'false'}`, `--userDataPath=${userData}`],
        contextIsolation: true,
        nodeIntegration: false,
        devTools: manifest.config.debug || false,
        backgroundThrottling: false,
      },
    });

    if (manifest.config.debug) {
      overlayWindow.webContents.openDevTools({ mode: 'undocked' });
      overlayWindow.isDev = true;
      console.info((({ node, electron, chrome }) => ({ node, electron, chrome }))(process.versions));
      try {
        const contextMenu = require('electron-context-menu')({
          append: (defaultActions, params, browserWindow) => [
            {
              label: 'Reload',
              visible: params,
              click: () => {
                overlayWindow.reload();
              },
            },
          ],
        });
      } catch (err) {
        dialog.showMessageBoxSync({
          type: 'warning',
          title: 'Context Menu',
          message: 'Failed to initialize context menu.',
          detail: `${err}`,
        });
      }
    }

    //User agent
    overlayWindow.webContents.userAgent = manifest.config['user-agent'];
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['User-Agent'] = manifest.config['user-agent'];
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setFullScreenable(false);
    overlayWindow.setFocusable(true);
    overlayWindow.blur();

    overlayWindow.loadFile(path.join(manifest.config.debug ? '' : userData, 'view\\overlay.html'));
    let selectedLanguage = 'english';
    overlayWindow.webContents.on('did-finish-load', () => {
      overlayWindow.webContents.send('show-overlay', info.game);
      overlayWindow.showInactive();
    });

    overlayWindow.on('closed', () => {
      isOverlayShowing = false;
      overlayWindow = null;
    });
  } catch (e) {
    debug.log(`Error creating overlay window, ${e}`);
    if (shouldQuitApp()) app.quit();
  }
}

async function createNotificationWindow(info) {
  try {
    if (isNotificationShowing) {
      earnedNotificationQueue.push(info);
      return;
    }
    isNotificationShowing = true;

    await startEngines();
    await getCachedData(info);
    closePuppeteer();
    const message = {
      name: info.game.name,
      displayName: info.a.displayName || '',
      description: info.a.description || '',
      icon: pathToFileURL(await fetchIcon(info.a.icon, info.appid)).href,
      icon_gray: pathToFileURL(await fetchIcon(info.a.icongray, info.appid)).href,
      preset: configJS.overlay.preset,
      position: configJS.overlay.position,
      scale: parseFloat(configJS.overlay.scale),
    };
    if (MainWin) MainWin.webContents.send('achievement-unlock', { appid: info.appid, ach_data: info.a });

    const display = require('electron').screen.getPrimaryDisplay();
    const { width, height } = display.workAreaSize;

    const preset = message.preset || 'default';
    const presetFolder = path.join(manifest.config.debug ? path.join(__dirname, '../') : userData, 'presets', preset);
    const presetHtml = path.join(presetFolder, 'index.html');
    const position = message.position || 'center-bot';
    const scale = parseFloat(message.scale * 0.01 || 1);

    const { width: windowWidth, height: windowHeight } = getPresetDimensions(presetFolder);

    const scaledWidth = windowWidth * scale;
    const scaledHeight = windowHeight * scale;

    let x = 0,
      y = 0;

    if (position.includes('left')) {
      x = 20;
    } else if (position.includes('right')) {
      x = width - scaledWidth - 20;
    } else if (position.includes('center')) {
      x = Math.floor(width / 2 - scaledWidth / 2);
    }

    if (position.includes('top')) {
      y = 10;
    } else if (position.includes('bot')) {
      y = height - Math.round(scaledHeight) - 20;
    } else if (position.includes('mid')) {
      y = height / 2 - Math.round(scaledHeight / 2);
    }

    notificationWindow = new BrowserWindow({
      width: scaledWidth,
      height: scaledHeight,
      x,
      y,
      transparent: true,
      frame: false,
      show: false,
      alwaysOnTop: true,
      focusable: true,
      resizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, '../overlayPreload.js'),
        additionalArguments: [`--isDev=${app.isDev ? 'true' : 'false'}`, `--userDataPath=${userData}`],
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });

    if (manifest.config.debug) {
      notificationWindow.webContents.openDevTools({ mode: 'undocked' });
      notificationWindow.isDev = true;
      console.info((({ node, electron, chrome }) => ({ node, electron, chrome }))(process.versions));
      try {
        const contextMenu = require('electron-context-menu')({
          append: (defaultActions, params, browserWindow) => [
            {
              label: 'Reload',
              visible: params,
              click: () => {
                notificationWindow.reload();
              },
            },
          ],
        });
      } catch (err) {
        dialog.showMessageBoxSync({
          type: 'warning',
          title: 'Context Menu',
          message: 'Failed to initialize context menu.',
          detail: `${err}`,
        });
      }
    }

    notificationWindow.setAlwaysOnTop(true, 'screen-saver');
    notificationWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    notificationWindow.setFullScreenable(false);
    notificationWindow.setFocusable(false);
    setTimeout(() => {
      notificationWindow.setIgnoreMouseEvents(true, { forward: true });
    }, 50);
    //notificationWindow.setIgnoreMouseEvents(true, { forward: true });
    notificationWindow.info = info;

    let soundFile;
    if (configJS.notification_toast.customToastAudio === '2' || configJS.notification_toast.customToastAudio === '1') {
      let toastAudio = require(path.join(__dirname, '../util/toastAudio.js'));
      soundFile =
        configJS.notification_toast.customToastAudio === '1'
          ? path.join(process.env.SystemRoot || process.env.WINDIR, 'media', toastAudio.getDefault())
          : toastAudio.getCustom();
    }
    notificationWindow.webContents.on('did-finish-load', () => {
      notificationWindow.showInactive();
      notificationWindow.webContents.send('set-window-scale', scale);
      notificationWindow.webContents.send('set-animation-scale', (configJS.overlay?.duration ?? 1) * 0.01);
      notificationWindow.webContents.send('show-notification', {
        game: message.name,
        displayName: message.displayName,
        description: message.description,
        iconPath: message.icon,
        scale,
      });
      createOverlayWindow({ appid: info.appid, action: 'refresh' });
      player.play(soundFile);
    });

    notificationWindow.on('closed', async () => {
      isNotificationShowing = false;
      notificationWindow = null;
      if (earnedNotificationQueue.length > 0) {
        createNotificationWindow(earnedNotificationQueue.shift());
        return;
      }
      if (shouldQuitApp()) app.quit();
    });

    notificationWindow.webContents.on('console-message', (e, level, message, line, sourceID) => {
      debug.log(message, sourceID, line);
    });

    notificationWindow.loadFile(presetHtml);
  } catch (e) {
    debug.log(`Error creating notification window: ${e}`);
    if (shouldQuitApp()) app.quit();
  }
}

async function createPlaytimeWindow(info) {
  try {
    if (isplaytimeWindowShowing) {
      playtimeQueue.push(info);
      return;
    }
    isplaytimeWindowShowing = true;

    const { width: screenWidth } = require('electron').screen.getPrimaryDisplay().workAreaSize;
    const winWidth = 460;
    const winHeight = 340;
    const x = Math.floor((screenWidth - winWidth) / 2);
    const y = 40;

    playtimeWindow = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      x,
      y,
      frame: false,
      type: 'notification',
      alwaysOnTop: true,
      transparent: true,
      resizable: false,
      show: false,
      skipTaskbar: true,
      focusable: false,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, '../overlayPreload.js'),
        additionalArguments: [`--isDev=${app.isDev ? 'true' : 'false'}`, `--userDataPath=${userData}`],
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    setTimeout(() => {
      playtimeWindow.setIgnoreMouseEvents(true, { forward: true });
    }, 50);
    playtimeWindow.setAlwaysOnTop(true, 'screen-saver');
    playtimeWindow.setVisibleOnAllWorkspaces(true);
    playtimeWindow.setFullScreenable(false);
    playtimeWindow.setFocusable(false);

    const desc = info.description;
    await startEngines();
    await getCachedData(info);
    closePuppeteer();
    info.description = desc;
    info.headerUrl = pathToFileURL(await fetchIcon(info.game.img.header, info.appid)).href;
    playtimeWindow.once('ready-to-show', () => {
      if (playtimeWindow && !playtimeWindow.isDestroyed()) {
        playtimeWindow.showInactive();

        //const prefs = fs.existsSync(preferencesPath) ? JSON.parse(fs.readFileSync(preferencesPath, 'utf8')) : {};
        const scale = 1; //prefs.notificationScale || 1;

        playtimeWindow.webContents.send('show-playtime', {
          ...info,
          scale,
        });
      }
    });
    ipcMain.once('close-playtime-window', () => {
      if (playtimeWindow && !playtimeWindow.isDestroyed()) {
        playtimeWindow.close();
      }
    });

    playtimeWindow.on('closed', () => {
      isplaytimeWindowShowing = false;
      playtimeWindow = null;
      if (playtimeQueue.length > 0) {
        createPlaytimeWindow(playtimeQueue.shift());
        return;
      }
      if (shouldQuitApp()) app.quit();
    });

    playtimeWindow.loadFile(path.join(manifest.config.debug ? path.join(__dirname, '..') : userData, 'view', 'playtime.html'));
  } catch (e) {
    debug.log(`Error creating playtime window: ${e}`);
    if (shouldQuitApp()) app.quit();
  }
}

async function createProgressWindow(info) {
  try {
    if (isProgressWindowShowing) {
      if (progressWindow.appid !== info.appid) {
        progressQueue.push(info);
        return;
      }
      progressWindow.close();
    }
    isProgressWindowShowing = true;
    const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;

    progressWindow = new BrowserWindow({
      width: 350,
      height: 150,
      x: 20,
      y: height - 140,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      focusable: true,
      resizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../overlayPreload.js'),
        additionalArguments: [`--isDev=${app.isDev ? 'true' : 'false'}`, `--userDataPath=${userData}`],
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });

    progressWindow.setAlwaysOnTop(true, 'screen-saver');
    progressWindow.setVisibleOnAllWorkspaces(true);
    progressWindow.setFullScreenable(false);
    progressWindow.setFocusable(true);
    setTimeout(() => {
      progressWindow.setIgnoreMouseEvents(true, { forward: true });
    }, 50);

    await startEngines();
    await getCachedData(info);
    closePuppeteer();
    info.a.icongray = pathToFileURL(await fetchIcon(info.a.icongray, info.appid)).href;

    progressWindow.webContents.on('did-finish-load', () => {
      progressWindow.showInactive();
      progressWindow.webContents.send('show-progress', info);
    });

    progressWindow.on('closed', () => {
      isProgressWindowShowing = false;
      progressWindow = null;
      if (progressQueue.length > 0) {
        createProgressWindow(progressQueue.shift());
        return;
      }
      if (shouldQuitApp()) app.quit();
    });

    setTimeout(() => {
      if (progressWindow && !progressWindow.isDestroyed()) progressWindow.close();
    }, 5000);

    progressWindow.loadFile(path.join(manifest.config.debug ? path.join(__dirname, '..') : userData, 'view/progress.html'));
    progressWindow.appid = info.appid;
  } catch (e) {
    debug.log(`Error creating progress window: ${e}`);
    if (shouldQuitApp()) app.quit();
  }
}

function getPresetDimensions(presetFolder) {
  const presetIndexPath = path.join(presetFolder, 'index.html');
  try {
    const content = fs.readFileSync(presetIndexPath, 'utf-8');
    const metaRegex = /<meta\s+width\s*=\s*"(\d+)"\s+height\s*=\s*"(\d+)"\s*\/?>/i;
    const match = content.match(metaRegex);
    if (match) {
      return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    }
  } catch (error) {
    notifyError('Error reading preset: ' + error.message);
  }
  // Default values if not defined
  return { width: 400, height: 200 };
}

function shouldQuitApp() {
  const noMain = !MainWin;
  const noNotifications = !isNotificationShowing && earnedNotificationQueue.length === 0;
  const noOverlay = !isOverlayShowing;
  const noProgress = !isProgressWindowShowing && progressQueue.length === 0;
  const noPlaytime = !isplaytimeWindowShowing && playtimeQueue.length === 0;

  return noMain && noNotifications && noOverlay && noProgress && noPlaytime;
}

function parseArgs(args) {
  let windowType = args['wintype'] || 'main'; // overlay, playtime, progress, achievement
  let appid = args['appid']; // appid
  let source = args['source'] || 'steam'; // source: steam, epic, gog, luma
  let ach = args['ach']; // achievement name
  let description = args['description']; // text
  let count = args['count'] || '0/100'; // count / max_count
  debug.log('opening ' + windowType + ' window');
  switch (windowType) {
    case 'playtime':
      createPlaytimeWindow({ appid, source, description });
      break;
    case 'overlay':
      createOverlayWindow({ appid, source, action: description });
      break;
    case 'progress':
      createProgressWindow({ appid, source, ach, count });
      break;
    case 'achievement':
      createNotificationWindow({ appid, source, ach });
      break;
    case 'main':
    default:
      autoUpdater.checkForUpdatesAndNotify();
      checkResources();
      createMainWindow();
      break;
  }
}

function checkResources() {
  function copyFolderRecursive(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const e of entries) {
      const srcPath = path.join(src, e.name);
      const dstPath = path.join(dst, e.name);
      if (e.isDirectory()) {
        copyFolderRecursive(srcPath, dstPath);
      } else {
        let shouldCopy = false;
        if (!fs.existsSync(dstPath)) shouldCopy = true;
        else {
          try {
            fs.accessSync(dstPath, fs.constants.W_OK);
            const srcStat = fs.statSync(srcPath);
            const dstStat = fs.statSync(dstPath);
            if (srcStat.size !== dstStat.size || srcStat.mtimeMs > dstStat.mtimeMs) shouldCopy = true;
          } catch {}
        }
        if (shouldCopy) fs.copyFileSync(srcPath, dstPath);
      }
    }
  }

  const resourcesPath = path.join(manifest.config.debug ? path.join(__dirname, '..') : path.join(process.resourcesPath, 'userdata'));

  const presets = path.join(resourcesPath, 'presets');
  copyFolderRecursive(presets, path.join(userData, 'Presets'));

  const media = path.join(resourcesPath, 'Media');
  copyFolderRecursive(media, path.join(userData, 'Media'));

  const view = path.join(resourcesPath, 'view');
  copyFolderRecursive(view, path.join(userData, 'view'));

  const source = path.join(resourcesPath, 'Source');
  copyFolderRecursive(source, path.join(userData, 'Source'));

  if (!fs.existsSync(path.join(app.getPath('appData'), 'obs-studio', 'basic', 'profiles', 'AW'))) {
    const profile = path.join(resourcesPath, 'obs', 'AW');
    copyFolderRecursive(profile, path.join(app.getPath('appData'), 'obs-studio', 'basic', 'profiles', 'AW'));
    fs.copyFileSync(path.join(resourcesPath, 'obs', 'AW.json'), path.join(app.getPath('appData'), 'obs-studio', 'basic', 'scenes', 'AW.json'));
  }

  app.setLoginItemSettings({
    openAtLogin: true,
    path: path.join(manifest.config.debug ? path.join(__dirname, '../../') : path.dirname(process.execPath), 'nw/nw.exe'),
    args: ['-config', 'watchdog.json'],
  });
}

try {
  if (app.requestSingleInstanceLock() !== true) app.quit();

  autoUpdater.on('update-downloaded', async (info) => {
    await startEngines();
    const skippedVersion = configJS.general.skippedVersion;
    if (skippedVersion.toLowerCase() !== 'none' && semver.gte(skippedVersion, info.version)) {
      return;
    }
    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `A new version (${info.version}) has been downloaded.`,
      detail: `Would you like to install it now?`,
      buttons: ['Yes', 'Later', 'Skip this version'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) autoUpdater.quitAndInstall();
    else if (response === 2) {
      configJS.general.skippedVersion = info.version;
      settingsJS.save(configJS);
    }
  });

  app
    .on('ready', async function () {
      ipc.window();
      const args = minimist(process.argv.slice(1));
      parseArgs(args);
    })
    .on('window-all-closed', function () {
      if (shouldQuitApp()) app.quit();
    })
    .on('web-contents-created', (event, contents) => {
      contents.on('new-window', (event, url) => {
        event.preventDefault();
      });
    })
    .on('second-instance', async (event, argv, cwd) => {
      const args = minimist(argv.slice(1));
      parseArgs(args);
    });
} catch (err) {
  dialog.showErrorBox('Critical Error', `Failed to initialize:\n${err}`);
  app.quit();
}
