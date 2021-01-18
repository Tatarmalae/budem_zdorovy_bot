const { Telegraf, Markup, Extra } = require('telegraf');
const config = require('config');
const logger = require('./errorHandler');
const Koa = require('koa');
const koaBody = require('koa-body');
const pool = require('./mysqlPool');

const BOT_TOKEN = config.get('BOT_TOKEN') || '';
const URL = config.get('URL') || '';
const PORT = config.get('PORT') || 3000;

let addressInfo = [];

const bot = new Telegraf(BOT_TOKEN, { telegram: { webhookReply: false } });

bot.command('start', ({ reply }) => {
  reply('Вы можете:\n\n&#8226;Узнать где и когда вам можно пройти вакцинацию, а именно к какой поликлинике вы относитесь по вашему адресу.\n\n&#8226;Получить ответы на часто задаваемые вопросы о вакцинации').then();
});

//Поиск ID в индексе Sphinx по введенному адресу
const getAddressID = (ctx) => {
  let addressID = [];
  const connectSphinx = pool.connectSphinx;
  return new Promise((resolve, reject) => {
    connectSphinx.query(
      `SELECT * FROM UIK WHERE MATCH('${ctx}') LIMIT 10`,
      (err, results) => {
        if (err) return reject(err.message);

        results.forEach(item => {
          addressID.push(item.id);
        });
        return resolve(addressID);
      }
    );
  });
};

//Получение информации о адресе по ID
const getAddressInfo = (ctx) => {
  let addressButton = [];
  addressInfo = [];
  const connectUIK = pool.connectDB;
  return new Promise((resolve, reject) => {
    connectUIK.query(
      `SELECT * FROM uik WHERE id IN (${ctx}) ORDER BY LENGTH(house), address`,
      (err, results) => {
        if (err) return reject(err.message);

        results.forEach(item => {
          addressInfo.push(JSON.parse(JSON.stringify(item)));

          let address = item.address.split(', ');// Разобьем строку на массив
          address.splice(1, 1);// Удалим район
          addressButton.push(address.join(', '));// Склеим обратно в строку
        });
        return resolve(addressButton);
      }
    );
  });
};

bot.on('text', async (ctx) => {

  const message = ctx.message.text.replace(/[\/]/g, ' ');
  const result = await getAddressID(message).catch((err) => {
    throw err;
  });

  if (result.length > 0) {
    const address = await getAddressInfo(result).catch((err) => {
      throw err;
    });
    let inlineKeyboardAddress = [];
    address.forEach((item, index) => {
      inlineKeyboardAddress.push(Markup.callbackButton(`${item}`, `uik_${index}`));
    });
    let keyboardAddress = Extra.HTML().markup(Markup.inlineKeyboard(inlineKeyboardAddress, {
      columns: 1
    }).resize());
    return ctx.reply('🗺️ Выберите адрес:', keyboardAddress);
  } else {
    return ctx.reply('🤷‍♂‍ К сожалению, я не смог ничего найти. Проверьте правильность написания адреса.\n\nДавайте попробуем еще раз! Мне нужен ваш адрес: Город, улица, дом. Номер квартиры вводить не надо!\n\nНапример: Казань, Декабристов, 10');
  }
});

bot.catch((err, ctx) => {
  logger.logError(`Error for ${ctx.updateType} ` + err).then();
});

bot.telegram.setWebhook(`${URL}/budem_zdorovy_bot`).then();

const app = new Koa();
app.use(koaBody());
app.use(async (ctx) => {
  if (ctx.method !== 'POST' || ctx.url !== '/budem_zdorovy_bot') {
    return;
  }
  await bot.handleUpdate(ctx.request.body, ctx.response);
  ctx.status = 200;
});

app.listen(PORT);