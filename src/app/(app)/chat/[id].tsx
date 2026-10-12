import { ImageViewerModal } from "@/components/ImageViewerModal";
import { ReactionPickerModal } from "@/components/ReactionPickerModal";
import { ReplyPreviewBar, ReplyTarget } from "@/components/ReplyPreviewBar";
import { MessageItemData, SwipeableMessageItem } from "@/components/SwipeableMessageItem";
import { TypingDots } from "@/components/TypingDots";
import { VideoNoteRecorder } from "@/components/VideoNoteRecorder";
import { COLORS } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { fetch } from "expo/fetch";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Кількість повідомлень в одній порції
const MESSAGES_PAGE_SIZE = 25;

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const chatRoomId = id as Id<"chatRooms">;
  const room = useQuery(api.rooms.getRoom, { roomId: chatRoomId });

  // Пагінований запит до Convex
  const {
    results: messages,
    status,
    loadMore,
    isLoading,
  } = usePaginatedQuery(
    api.messages.getPaginatedMessages,
    { chatRoomId },
    { initialNumItems: MESSAGES_PAGE_SIZE }
  );

  // Обробник довантаження при скролі вгору до старих повідомлень
  const handleLoadMore = () => {
    if (status === "CanLoadMore") {
      loadMore(MESSAGES_PAGE_SIZE);
    }
  };

  const currentUser = useQuery(api.users.currentUser);
  const typingUsers = useQuery(api.typing.getTypingUsers, { chatRoomId });

  const sendMessage = useMutation(api.messages.sendMessage);
  const sendMediaMessage = useMutation(api.messages.sendMediaMessage);
  const sendAudioMessage = useMutation(api.messages.sendAudioMessage);
  const sendVideoNoteMessage = useMutation(api.messages.sendVideoNoteMessage);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const editMessage = useMutation(api.messages.editMessage);
  const deleteMessage = useMutation(api.messages.deleteMessage);
  const setTyping = useMutation(api.typing.setTyping);
  const toggleReaction = useMutation(api.reactions.toggleReaction);

  // Ініціалізація аудіорекордера для голосових повідомлень
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const [inputText, setInputText] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<Id<"messages"> | null>(null);
  const [reactingMessageId, setReactingMessageId] = useState<Id<"messages"> | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [isVideoRecorderVisible, setIsVideoRecorderVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const lastTypingCallRef = useRef<number>(0);

  // Тротлінг індикатора набору тексту
  const handleTextChange = (text: string) => {
    setInputText(text);

    const now = Date.now();
    if (now - lastTypingCallRef.current > 1500) {
      lastTypingCallRef.current = now;
      setTyping({ chatRoomId }).catch(console.error);
    }
  };

  // Вибір фото з галереї
  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Дозвіл потрібен", "Надайте доступ до медіатеки для надсилання фотографій.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setSelectedImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Помилка", "Не вдалося вибрати зображення");
    }
  };

  // Початок відповіді на повідомлення
  const handleStartReply = (msg: MessageItemData) => {
    setReplyTarget({
      messageId: msg._id,
      senderName: msg.senderName,
      text:
        msg.content ||
        (msg.imageUrl
          ? "📷 Фотографія"
          : msg.audioUrl
          ? "🎤 Голосове повідомлення"
          : msg.videoUrl
          ? "📹 Відеоповідомлення"
          : ""),
    });
    // Скасовуємо режим редагування, якщо він був відкритий
    setEditingMessageId(null);
  };

  // Відправка повідомлення або збереження змін
  const handleSend = async () => {
    const text = inputText.trim();
    if ((!text && !selectedImageUri) || isSubmitting) return;

    try {
      setIsSubmitting(true);

      if (editingMessageId) {
        // Режим збереження редагування
        await editMessage({
          messageId: editingMessageId,
          content: text,
        });
        setEditingMessageId(null);
      } else if (selectedImageUri) {
        // Відправка фотографії у Convex Storage через expo-file-system та expo/fetch
        const uploadUrl = await generateUploadUrl();
        const file = new File(selectedImageUri);

        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: file,
        });

        if (!uploadResult.ok) throw new Error("Не вдалося завантажити зображення");

        const { storageId } = await uploadResult.json();

        await sendMediaMessage({
          chatRoomId,
          storageId,
          caption: text || undefined,
          replyToId: replyTarget ? (replyTarget.messageId as Id<"messages">) : undefined,
          replyToSender: replyTarget?.senderName,
          replyToText: replyTarget?.text,
        });

        setSelectedImageUri(null);
        setReplyTarget(null);
      } else {
        // Відправка звичайного тексту з відповіддю (якщо задано)
        await sendMessage({
          chatRoomId,
          content: text,
          replyToId: replyTarget ? (replyTarget.messageId as Id<"messages">) : undefined,
          replyToSender: replyTarget?.senderName,
          replyToText: replyTarget?.text,
        });

        setReplyTarget(null);
      }

      setInputText("");
    } catch (error) {
      console.error(error);
      Alert.alert("Помилка", "Не вдалося надіслати повідомлення");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Старт запису голосового повідомлення
  const startRecording = async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Дозвіл не надано",
        "Для запису голосових повідомлень потрібен доступ до мікрофона."
      );
      return;
    }

    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      console.error("Помилка початку запису:", error);
      Alert.alert("Помилка", "Не вдалося розпочати запис аудіо.");
    }
  };

  // Скасування запису
  const cancelRecording = async () => {
    try {
      await audioRecorder.stop();
    } catch (error) {
      console.error("Помилка скасування запису:", error);
    }
  };

  // Зупинка та надсилання голосового повідомлення
  const stopAndSendRecording = async () => {
    try {
      const durationSeconds = Math.round(
        (recorderState.durationMillis || 0) / 1000
      );

      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (!uri || durationSeconds < 1) {
        Alert.alert("Занадто коротке", "Голосове повідомлення занадто коротке.");
        return;
      }

      setIsSubmitting(true);

      // 1. Отримуємо одноразовий URL для завантаження у Convex Storage
      const uploadUrl = await generateUploadUrl();

      // 2. Читаємо локальний аудіофайл та завантажуємо
      let bodyData: any;
      try {
        bodyData = new File(uri);
      } catch {
        const response = await fetch(uri);
        bodyData = await response.blob();
      }

      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "audio/m4a" },
        body: bodyData,
      });

      if (!uploadResult.ok) {
        throw new Error("Не вдалося завантажити аудіофайл");
      }

      const { storageId } = await uploadResult.json();

      // 3. Зберігаємо повідомлення в базі
      await sendAudioMessage({
        chatRoomId,
        audioStorageId: storageId,
        audioDuration: durationSeconds,
        replyToId: replyTarget ? (replyTarget.messageId as Id<"messages">) : undefined,
        replyToSender: replyTarget?.senderName,
        replyToText: replyTarget?.text,
      });

      setReplyTarget(null);
    } catch (error) {
      console.error("Помилка завантаження аудіо:", error);
      Alert.alert("Помилка", "Не вдалося надіслати голосове повідомлення.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Надсилання відеоповідомлення у кружечку
  const handleSendVideoNote = async (videoUri: string, duration: number) => {
    try {
      setIsSubmitting(true);

      const uploadUrl = await generateUploadUrl();

      let bodyData: any;
      try {
        bodyData = new File(videoUri);
      } catch {
        const response = await fetch(videoUri);
        bodyData = await response.blob();
      }

      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "video/mp4" },
        body: bodyData,
      });

      if (!uploadResult.ok) {
        throw new Error("Не вдалося завантажити відео");
      }

      const { storageId } = await uploadResult.json();

      await sendVideoNoteMessage({
        chatRoomId,
        videoStorageId: storageId,
        videoDuration: duration,
        replyToId: replyTarget ? (replyTarget.messageId as Id<"messages">) : undefined,
        replyToSender: replyTarget?.senderName,
        replyToText: replyTarget?.text,
      });

      setReplyTarget(null);
    } catch (error) {
      console.error("Помилка завантаження відео:", error);
      Alert.alert("Помилка", "Не вдалося надіслати відеоповідомлення.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Обробник вибору реакції (емодзі)
  const handleSelectReaction = async (emoji: string) => {
    if (!reactingMessageId) return;
    try {
      await toggleReaction({ messageId: reactingMessageId, emoji });
    } catch (error) {
      console.error("Помилка реакції:", error);
    }
  };

  // Контекстне меню дій з повідомленням
  const handleMessageLongPress = (item: MessageItemData) => {
    const isOwn = item.senderId === currentUser?._id;

    const options: any[] = [
      {
        text: "Поставити реакцію",
        onPress: () => setReactingMessageId(item._id),
      },
      {
        text: "Відповісти",
        onPress: () => handleStartReply(item),
      },
    ];

    if (isOwn) {
      if (item.content) {
        options.push({
          text: "Редагувати",
          onPress: () => {
            setEditingMessageId(item._id);
            setInputText(item.content || "");
            setReplyTarget(null);
          },
        });
      }

      options.push({
        text: "Видалити",
        style: "destructive",
        onPress: () => {
          Alert.alert("Видалити повідомлення?", "Ви впевнені, що хочете видалити повідомлення?", [
            { text: "Скасувати", style: "cancel" },
            {
              text: "Так, видалити",
              style: "destructive",
              onPress: () => deleteMessage({ messageId: item._id }),
            },
          ]);
        },
      });
    }

    options.push({ text: "Скасувати", style: "cancel" });

    Alert.alert("Дії з повідомленням", undefined, options);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen
        options={{
          title: room?.title ?? "Чат",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/settings/${chatRoomId}`)}
              className="p-1"
            >
              <Ionicons name="information-circle-outline" size={24} color={COLORS.primary} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Список повідомлень */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item._id}
        inverted={true}
        renderItem={({ item }) => (
          <SwipeableMessageItem
            item={item as MessageItemData}
            isOwn={item.senderId === currentUser?._id}
            onLongPress={() => handleMessageLongPress(item as MessageItemData)}
            onReply={handleStartReply}
            onImagePress={(url) => setFullscreenImage(url)}
            onAuthorPress={(authorId) => router.push(`/user/${authorId}`)}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 16 }}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          status === "LoadingMore" ? (
            <View className="py-4 items-center w-full">
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View className="py-12 items-center justify-center">
              <Text className="text-textMuted text-grey text-sm text-center">
                У цій кімнаті ще немає повідомлень.{"\n"}Напишіть першим!
              </Text>
            </View>
          ) : null
        }
      />

      {/* Індикатор набору тексту іншими учасниками */}
      {typingUsers && typingUsers.length > 0 && <TypingDots typingUsers={typingUsers} />}

      {/* Панель активного цитування (Reply Bar) */}
      {replyTarget && (
        <ReplyPreviewBar
          replyTarget={replyTarget}
          onCancel={() => setReplyTarget(null)}
        />
      )}

      {/* Панель активного редагування власного повідомлення */}
      {editingMessageId && (
        <View className="flex-row items-center justify-between px-4 py-2 bg-surfaceLight border-t border-surface">
          <View className="flex-row items-center flex-1 mr-2">
            <Ionicons name="pencil" size={16} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text className="text-white text-xs font-semibold">Редагування повідомлення</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setEditingMessageId(null);
              setInputText("");
            }}
          >
            <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Прев'ю обраної картинки перед відправкою */}
      {selectedImageUri && (
        <View className="flex-row items-center px-4 py-2 bg-surfaceLight border-t border-surface">
          <Image source={{ uri: selectedImageUri }} className="w-12 h-12 rounded-lg mr-3" />
          <Text className="text-white text-xs flex-1">Фото прикріплено</Text>
          <TouchableOpacity onPress={() => setSelectedImageUri(null)}>
            <Ionicons name="close-circle" size={22} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      )}

      {/* Панель введення тексту та запису аудіо */}
      <View className="p-3 bg-surface border-t border-surfaceLight">
        {recorderState.isRecording ? (
          <View className="flex-row items-center justify-between bg-surfaceLight/60 px-4 py-2.5 rounded-2xl">
            <View className="flex-row items-center gap-3">
              <View key="voice-rec-dot" className="w-3 h-3 rounded-full bg-red-500" />
              <Text className="text-white font-medium">
                Запис: {Math.floor((recorderState.durationMillis || 0) / 1000)} с
              </Text>
            </View>

            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                onPress={cancelRecording}
                className="p-2 active:opacity-70"
              >
                <Ionicons name="trash-outline" size={22} color="#EF4444" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={stopAndSendRecording}
                disabled={isSubmitting}
                className="w-10 h-10 rounded-full bg-primary items-center justify-center active:opacity-80"
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={pickImage}
              disabled={isSubmitting}
              className="mr-2 p-2 rounded-full bg-surfaceLight"
            >
              <Ionicons name="image-outline" size={22} color={COLORS.primary} />
            </TouchableOpacity>

            <TextInput
              className="flex-1 bg-background text-white px-4 py-2.5 rounded-full text-base border border-surfaceLight mr-2"
              placeholder={
                editingMessageId
                  ? "Змініть текст..."
                  : replyTarget
                  ? `Відповідь для ${replyTarget.senderName}...`
                  : selectedImageUri
                  ? "Додайте підпис до фото..."
                  : "Напишіть повідомлення..."
              }
              placeholderTextColor={COLORS.textMuted}
              value={inputText}
              onChangeText={handleTextChange}
              multiline
            />

            {inputText.trim().length > 0 || selectedImageUri || editingMessageId ? (
              <TouchableOpacity
                onPress={handleSend}
                disabled={(!inputText.trim() && !selectedImageUri) || isSubmitting}
                className={`w-11 h-11 rounded-full items-center justify-center bg-primary ${
                  (!inputText.trim() && !selectedImageUri) || isSubmitting
                    ? "opacity-50"
                    : "active:opacity-80"
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons
                    name={editingMessageId ? "checkmark" : "send"}
                    size={20}
                    color="#FFFFFF"
                  />
                )}
              </TouchableOpacity>
            ) : (
              <View className="flex-row items-center gap-1.5">
                <TouchableOpacity
                  onPress={() => setIsVideoRecorderVisible(true)}
                  disabled={isSubmitting}
                  className="w-11 h-11 rounded-full items-center justify-center bg-surfaceLight active:opacity-80"
                >
                  <Ionicons name="videocam-outline" size={22} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={startRecording}
                  disabled={isSubmitting}
                  className="w-11 h-11 rounded-full items-center justify-center bg-surfaceLight active:opacity-80"
                >
                  <Ionicons name="mic" size={22} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Модальне вікно перегляду зображення */}
      <ImageViewerModal
        visible={!!fullscreenImage}
        imageUrl={fullscreenImage}
        onClose={() => setFullscreenImage(null)}
      />

      {/* Модальне вікно вибору емодзі */}
      <ReactionPickerModal
        visible={!!reactingMessageId}
        onClose={() => setReactingMessageId(null)}
        onSelectEmoji={handleSelectReaction}
      />

      {/* Модальне вікно запису відеокружечка */}
      <VideoNoteRecorder
        visible={isVideoRecorderVisible}
        onClose={() => setIsVideoRecorderVisible(false)}
        onSendVideo={handleSendVideoNote}
      />
    </KeyboardAvoidingView>
  );
}