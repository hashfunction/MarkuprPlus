/**
 * Default context for local Whisper transcription.
 *
 * Whisper uses this as a vocabulary/style hint. It is intentionally short so
 * it does not crowd out the actual spoken audio in the model context.
 */
export const DEFAULT_WHISPER_INITIAL_PROMPT = [
  '繁體中文的遊戲開發與軟體介面回饋。',
  '常用詞彙：icon、按鈕、UI、HUD、圖示、畫面、資訊、動態、動畫、特效、描邊、滑鼠、滑鼠移過去、點擊、地圖、角色、怪物、卡牌、牌組、藥水、藥水格、空的圖示、金幣、格擋、防住、血量、能量、攻擊、受擊、回合、結束回合、鍛造、原版、觸發點、相關資訊、相關圖片、彈出、播放完成、相同於、BUG、偵錯、打怪、打王。',
].join(' ');
