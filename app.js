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

bot.command('start', (ctx) => {
  const inlineKeyboardStart = [
    Markup.callbackButton('Где мне пройти вакцинацию?', 'address'),
    Markup.callbackButton(
      'Узнать ответы на вопросы о вакцинации!',
      'questions'
    ),
  ];
  let keyboardStart = Extra.HTML().markup(
    Markup.inlineKeyboard(inlineKeyboardStart, {
      columns: 1,
    }).resize()
  );
  ctx
    .replyWithHTML(
      `Вы можете:\n\n &#8226; Узнать где и когда вам можно пройти вакцинацию, а именно к какой поликлинике вы относитесь по вашему адресу.\n &#8226; Получить ответы на часто задаваемые вопросы о вакцинации`,
      keyboardStart
    )
    .then();
});

bot.action('address', async (ctx) => {
  await ctx.answerCbQuery('⌛ Информация загружается ⌛').then(() => {
    ctx.deleteMessage();
    return ctx.reply(
      'Для начала поиска вашей поликлиники мне нужно получить ваш адрес в формате «Город, улица, дом». Номер квартиры вводить не надо!\n\nНапример: Казань, Декабристов, 10'
    );
  });
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

        results.forEach((item) => {
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

        results.forEach((item) => {
          addressInfo.push(JSON.parse(JSON.stringify(item)));

          let address = item.address.split(', '); // Разобьем строку на массив
          address.splice(1, 1); // Удалим район
          addressButton.push(address.join(', ')); // Склеим обратно в строку
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
      inlineKeyboardAddress.push(
        Markup.callbackButton(`${item}`, `uik_${index}`)
      );
    });
    let keyboardAddress = Extra.HTML().markup(
      Markup.inlineKeyboard(inlineKeyboardAddress, {
        columns: 1,
      }).resize()
    );
    return ctx.reply('🗺️ Выберите адрес:', keyboardAddress);
  } else {
    return ctx.reply(
      '🤷‍♂‍ К сожалению, я не смог ничего найти. Проверьте правильность написания адреса.\n\nДавайте попробуем еще раз! Мне нужен ваш адрес: Город, улица, дом. Номер квартиры вводить не надо!\n\nНапример: Казань, Декабристов, 10'
    );
  }
});

bot.action(/uik_[0-9]/, async (ctx) => {
  if (!addressInfo) return;

  await addressInfo[ctx.callbackQuery.data.match(/_[0-9]*/)[0].substr(1)][
    'uik'
  ];
  const options = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Узнать больше о вакцинации', callback_data: 'questions' }],
        [{ text: 'Позаботиться о близком человеке', switch_inline_query: '' }],
      ],
    },
  };
  /*const inlineKeyboardMore = [
                              Markup.callbackButton('Узнать больше о вакцинации', 'more'),
                              Markup.callbackButton('Позаботиться о близком человеке', 'share'),
                          ];
                          let keyboardMore = Extra.HTML().markup(
                              Markup.inlineKeyboard(inlineKeyboardMore, {
                                  columns: 1,
                              }).resize()
                          );*/
  await ctx.answerCbQuery('⌛ Информация загружается ⌛').then(() => {
    ctx.deleteMessage();
    return ctx.replyWithHTML(
      '<b>Поликлиника №20</b>\n\n📍 Адрес: г. Казань, ул. Сахарова д.23\n\n🚪Кабинет: 219\n\n⏰ Время приема: Пн-Пт 09:00-13:00\n\n📱Телефон: 8 (843) 528-03-20\n\nТакже вы можете воспользоваться другими функциями:',
      options
    );
  });
});

bot.action('questions', async (ctx) => {
  const inlineKeyboardFAQ = [
    Markup.callbackButton(
      'Каким образом исследовалась безопасность вакцины?',
      'faq'
    ),
    Markup.callbackButton(
      'В чем разница между вакцинами против COVID-19?',
      'faq'
    ),
    Markup.callbackButton('Содержит ли вакцина живой вирус?', 'faq'),
    Markup.callbackButton(
      'Сколько введений вакцины потребуется для формирования иммунитета?',
      'faq'
    ),
    Markup.callbackButton('Насколько эффективна вакцина?', 'faq'),
    Markup.callbackButton(
      'Нужна ли самоизоляция до или после прививки от коронавируса?',
      'faq'
    ),
  ];
  let keyboardFAQ = Extra.HTML().markup(
    Markup.inlineKeyboard(inlineKeyboardFAQ, {
      columns: 1,
    }).resize()
  );
  await ctx.answerCbQuery('⌛ Информация загружается ⌛').then(() => {
    ctx.deleteMessage();
    return ctx.replyWithHTML('❓ Выберите вопрос:', keyboardFAQ);
  });
});

bot.action('faq', async (ctx) => {
  await ctx.answerCbQuery('⌛ Информация загружается ⌛').then(() => {
    ctx.deleteMessage();
    return ctx
      .replyWithVideo(
        {
          source: __dirname + '/video.mp4',
        },
        {
          //caption,
          //thumb: __dirname + '/thumb.jpeg',
        }
      )
      .then(() => {
        const options = {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Узнать больше о вакцинации',
                  callback_data: 'questions',
                },
              ],
              [
                {
                  text: 'Позаботиться о близком человеке',
                  switch_inline_query: '',
                },
              ],
            ],
          },
        };
        return ctx.replyWithHTML('Большую часть вакцинных препаратов, разрабатываемых для профилактики COVID-19, составляют субъединичные вакцины. Частое использование данной технологической платформы в первую очередь обусловлено безопасностью таких вакцин.\n\nНемаловажно, что субъединичные вакцины обладают «технологической безопасностью», потому что ни на одной стадии их производства не используется живой вирус, а сама вакцина содержит только вирусные белки.\n\nДля формирования полноценного иммунного ответа такие препараты, как правило, вводятся несколько раз и требуют добавления компонентов, усиливающих иммунный ответ, например адъювантов или иммуностимуляторов.', options);
      });
  });
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
