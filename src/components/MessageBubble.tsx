import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation } from "convex/react";
import React, { useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { ReactionBadges } from "./ReactionBadges";
import { ReactionPickerModal } from "./ReactionPickerModal";
import { VideoNotePlayer } from "./VideoNotePlayer";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer";

export interface MessageBubbleData {
  _id: Id<"messages">;
  senderId: Id<"users">;
  senderName: string;
  senderPhoto?: string;
  content?: string;
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  videoUrl?: string;
  videoStorageId?: Id<"_storage">;
  videoDuration?: number;
  isVideoNote?: boolean;
  isEdited?: boolean;
  replyToId?: Id<"messages">;
  replyToSender?: string;
  replyToText?: string;
  _creationTime: number;
}

export interface MessageBubbleProps {
  message: MessageBubbleData;
  isMyMessage?: boolean;
  onLongPress?: () => void;
  onImagePress?: (url: string) => void;
  onAuthorPress?: (userId: Id<"users">) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isMyMessage = false,
  onLongPress,
  onImagePress,
  onAuthorPress,
}) => {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const toggleReaction = useMutation(api.reactions.toggleReaction);

  const handleSelectEmoji = async (emoji: string) => {
    try {
      await toggleReaction({ messageId: message._id, emoji });
    } catch (error) {
      console.error("Помилка реакції:", error);
    }
  };

  const handleLongPress = () => {
    if (onLongPress) {
      onLongPress();
    } else {
      setShowReactionPicker(true);
    }
  };

  const isVideoNote = Boolean(message.videoUrl && message.isVideoNote);

  return (
    <View className={`my-1 ${isMyMessage ? "items-end" : "items-start"}`}>
      {/* Обгортка бульбашки з викликом реакцій або дій по довгому натисканню */}
      <TouchableOpacity
        onLongPress={handleLongPress}
        activeOpacity={0.9}
        className={`max-w-[82%] rounded-2xl ${
          isVideoNote
            ? "p-1 bg-surface/40"
            : isMyMessage
            ? "bg-primary rounded-br-xs p-3"
            : "bg-secondary rounded-bl-xs p-3"
        }`}
      >
        {/* Автор повідомлення */}
        {!isMyMessage && (
          <TouchableOpacity
            onPress={() => onAuthorPress?.(message.senderId)}
            activeOpacity={0.7}
            className="mb-1"
          >
            <Text className="text-primary font-bold text-xs">{message.senderName}</Text>
          </TouchableOpacity>
        )}

        {message.videoUrl && message.isVideoNote ? (
          <View className="my-1 items-center justify-center p-1">
            <VideoNotePlayer
              videoUrl={message.videoUrl}
              duration={message.videoDuration}
              size={210}
            />
          </View>
        ) : (
          <>
            {/* Блок цитованого повідомлення (Reply Box) */}
            {message.replyToSender && (
              <View className="mb-2 p-2 rounded-lg bg-surface/50 border-l-2 border-primary">
                <Text className="text-primary font-semibold text-[11px]">
                  {message.replyToSender}
                </Text>
                <Text className="text-white/70 text-xs mt-0.5" numberOfLines={2}>
                  {message.replyToText ||
                    (message.audioUrl
                      ? "🎤 Голосове повідомлення"
                      : message.imageUrl
                      ? "📷 Фотографія"
                      : message.videoUrl
                      ? "📹 Відеоповідомлення"
                      : "")}
                </Text>
              </View>
            )}

            {/* Фотографія (якщо прикріплена) */}
            {message.imageUrl && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => onImagePress?.(message.imageUrl!)}
              >
                <Image
                  source={{ uri: message.imageUrl }}
                  className="w-56 h-56 rounded-xl mb-1.5 bg-surface"
                  resizeMode="cover"
                />
              </TouchableOpacity>
            )}

            {/* Голосове повідомлення */}
            {message.audioUrl && (
              <View className="my-1">
                <VoiceMessagePlayer
                  audioUrl={message.audioUrl}
                  duration={message.audioDuration}
                  isMyMessage={isMyMessage}
                />
              </View>
            )}

            {/* Текст повідомлення */}
            {message.content ? (
              <Text className="text-white text-base leading-5">{message.content}</Text>
            ) : null}
          </>
        )}

        {/* Час та статус редагування */}
        <View className="flex-row items-center justify-end mt-1 gap-1">
          {message.isEdited && (
            <Text className="text-white/60 text-[10px] italic">(ред.)</Text>
          )}
          <Text className="text-white/60 text-[10px]">
            {new Date(message._creationTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Бейджі реакцій під бульбашкою */}
      <ReactionBadges messageId={message._id} />

      {/* Модальне вікно вибору емодзі */}
      <ReactionPickerModal
        visible={showReactionPicker}
        onClose={() => setShowReactionPicker(false)}
        onSelectEmoji={handleSelectEmoji}
      />
    </View>
  );
};