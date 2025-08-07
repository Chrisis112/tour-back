import { Bot, session, Context } from "grammy";
import { conversations, createConversation, Conversation, ConversationFlavor } from "@grammyjs/conversations";
import User from "../models/User";

type MyContext = Context & ConversationFlavor<Context> & { session: any };

const bot = new Bot<MyContext>(process.env.TELEGRAM_BOT_TOKEN!);

bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

async function connectConversation(
  conversation: Conversation<MyContext, MyContext>,
  ctx: MyContext
) {
  await ctx.reply("Please enter your email for linking your profile.");

  const emailMsg = await conversation.wait();

  const email = emailMsg.message?.text?.trim();
  if (!email) {
    await ctx.reply("You didn't enter an email. Please try again with /connect.");
    return;
  }

 const therapist = await User.findOne({
  email: email.toLowerCase(),
  userType: { $in: ['THERAPIST'] },
});
  if (!therapist) {
    await ctx.reply("Profile not found. Please contact support.");
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) {
    await ctx.reply("Cannot detect your chat. Please try again.");
    return;
  }

  const telegramUserId = ctx.from?.id?.toString() ?? "";

  // Исправленная проверка: сравниваем telegramUserId И telegramChatId
  if (therapist.telegramUserId !== telegramUserId || therapist.telegramChatId !== chatId.toString()) {
    therapist.telegramUserId = telegramUserId;
    therapist.telegramChatId = chatId.toString();
    try {
      await therapist.save();
      console.log('Before saving therapist.userType:', therapist.userType);
if (
  !Array.isArray(therapist.userType) ||
  therapist.userType.some((role: string) => !['THERAPIST'].includes(role))
) {
  // Если есть пустые строки или неверные роли - очистить
  therapist.userType = (therapist.userType || []).filter((role: string) =>
    ['THERAPIST'].includes(role)
  );
  console.log('Cleaned therapist.userType:', therapist.userType);
}

      console.log(`Telegram info saved for therapist ${therapist._id}`);
      await ctx.reply("Telegram successfully linked to your profile.");
    } catch (err) {
      console.error("Failed to save Telegram info:", err);
      await ctx.reply("Failed to link Telegram to your profile. Please contact support.");
    }
  } else {
    // Если данные уже совпадают — подтверждаем связь
    await ctx.reply("Telegram is already linked to your profile.");
  }
}

bot.use(createConversation(connectConversation, "connectConversation"));

bot.command("connect", async (ctx) => {
  await ctx.conversation.enter("connectConversation");
});

export async function notifyTherapist(params: {
  chatId: string | number;
  service: string;
  date: string;
  time: string;
  clientName: string;
  address: string;
  duration: number;
}) {
  const { chatId, service, date, time, clientName, address, duration } = params;

  const message =
    `Привет!\n` +
    `У тебя только что заказали услугу: "${service.trim()}"\n` +
    `Клиент: ${clientName}\n`+
    `Дата заказа: ${date}\n` +
    `Время начала: ${time}\n` +
    `Адрес куда приехать: ${address}\n` +
    `Длительность: ${duration}` +`min`
    

  try {
    await bot.api.sendMessage(chatId, message);
    console.log(`Telegram notification sent to chatId ${chatId}`);
  } catch (error) {
    console.error("Failed to send Telegram notification:", error);
  }
}

bot.start()
  .then(() => console.log("Bot started"))
  .catch(console.error);

export { bot };
