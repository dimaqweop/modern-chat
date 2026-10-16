import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api"; // 👈 Додати імпорт internal

/**
 * Мутація для додавання або зняття реакції (Toggle)
 */
export const toggleReaction = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: Потрібна авторизація");
    }

    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found: Повідомлення не знайдено");
    }

    // Перевіряємо, чи користувач вже ставив цю реакцію
    const existing = await ctx.db
      .query("messageReactions")
      .withIndex("by_message_and_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", userId)
      )
      .filter((q) => q.eq(q.field("emoji"), args.emoji))
      .first();

    if (existing) {
      // Якщо вже стоїть — видаляємо її (зняття реакції)
      await ctx.db.delete(existing._id);
      return { action: "removed" };
    }

    // Додаємо нову реакцію
    await ctx.db.insert("messageReactions", {
      messageId: args.messageId,
      userId,
      emoji: args.emoji,
      createdAt: Date.now(),
    });

    // 👇 НАДСИЛАЄМО ПУШ АВТОРУ ПОВІДОМЛЕННЯ (якщо реакцію поставив інший користувач)
    if (message.senderId !== userId) {
      const messageAuthor = await ctx.db.get(message.senderId);
      const sender = await ctx.db.get(userId);
      const room = await ctx.db.get(message.chatRoomId);

      if (messageAuthor?.pushToken && sender) {
        const senderName = sender.name ?? sender.email ?? "Співрозмовник";
        const roomTitle = room?.title ?? "чаті";

        await ctx.scheduler.runAfter(
          0,
          internal.pushNotifications.sendPushNotification,
          {
            pushToken: messageAuthor.pushToken,
            title: `Нова реакція ${args.emoji}`,
            body: `${senderName} відреагував(ла) ${args.emoji} на ваше повідомлення у "${roomTitle}"`,
            data: {
              type: "reaction",
              roomId: message.chatRoomId,
              messageId: message._id,
            },
          }
        );
      }
    }

    return { action: "added" };
  },
});

/**
 * Отримання списку реакцій для списку або одного повідомлення
 */
export const getMessageReactions = query({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    const rawReactions = await ctx.db
      .query("messageReactions")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect();

    // Групуємо реакції за емодзі
    const map = new Map<
      string,
      { emoji: string; count: number; hasReacted: boolean }
    >();

    for (const r of rawReactions) {
      const item = map.get(r.emoji) || {
        emoji: r.emoji,
        count: 0,
        hasReacted: false,
      };
      item.count += 1;
      if (userId && r.userId === userId) {
        item.hasReacted = true;
      }
      map.set(r.emoji, item);
    }

    return Array.from(map.values());
  },
});