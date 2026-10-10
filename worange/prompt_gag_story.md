# 《和事橙》四格漫畫 — Gemini 出圖 prompt

品牌：和橙 WOrange（香港品牌，郴州自家果園，不用農藥、人手除草）
用途：解釋品牌名「和橙」的由來，三十秒短片或社交平台單帖。
食字位：**和事佬 → 和事橙 → 和橙**

角色設定要與現有分鏡一致：
- **刀疤橙**：橙色圓形擬人角色，果皮上有幾道自然癒合的疤痕（不是傷口，是淺色線紋），頭頂一片綠葉，有手有腳，表情友善。
- **蚯蚓 John**：粉紅色蚯蚓，圓眼睛、笑臉，身體可彎成 W 形。
- **公雞**：褐紅羽毛的農場大公雞，神氣、雞冠鮮紅。

---

## Prompt（直接貼入 Gemini）

```
Create a single image: a 4-panel comic strip laid out in a 2x2 grid, warm
children's-picture-book illustration style with soft watercolour texture and
clean black outlines — same look as a friendly agricultural brand mascot comic.
Consistent characters across all four panels. Traditional Chinese dialogue in
white speech bubbles with clean, correct 繁體中文 typography.

Setting: a sunny organic orange orchard with red soil, orange trees heavy with
fruit, low grass, no machinery.

Characters:
- SCARRED ORANGE: an anthropomorphic orange with arms and legs, a green leaf on
  top, and three or four pale healed scar-lines across its peel. Friendly, round
  eyes, small smile.
- JOHN THE EARTHWORM: a pink cartoon earthworm with big round eyes and a smiling
  mouth, body curved like the letter W.
- ROOSTER: a proud farm rooster with reddish-brown feathers and a bright red comb.

Panel 1 (top-left): The rooster leans down toward John the earthworm on the
soil, beak open, hungry look. Speech bubble (rooster): 「你成日鑽嚟鑽去，
唔知幾好味。」 John looks up, unimpressed, speech bubble: 「冇我鬆土，
你企緊嗰塊地硬過石頭！」

Panel 2 (top-right): The rooster and the earthworm tumble together in a comic
dust cloud, feathers and soil flying, an orange tree shaking above them, three
small oranges peeking out from the leaves to watch. Motion lines, no blood,
purely comedic.

Panel 3 (bottom-left): The scarred orange drops down between them with a thud,
arms spread wide to separate them, determined expression. Speech bubble:
「停手！冇雞屎冇肥料，冇蚯蚓冇鬆土——我先係食你哋兩個大㗎！」

Panel 4 (bottom-right): The rooster and John are laughing together, the scarred
orange standing between them with an arm around each. Behind them a wooden
orchard signboard reads 「和橙 WOrange」. Caption box at the bottom of the panel:
「講和之後，佢就叫做——和事橙。」

Style notes: bright natural daylight, warm oranges and greens, no photorealism,
no text outside the speech bubbles and the caption box, no watermark.
All Chinese characters must be correct Traditional Chinese — double-check the
glyphs.
```

---

## 出圖之後

1. 存成 `proposal/s3_1.jpg`（2000px 闊以上）。
2. 在 deck 的「故事三《和事橙》」那一頁，把 `<div class="topstrip t4">` 那塊換成
   `<div class="sbstage"><img src="proposal/s3_1.jpg" alt="和事橙 四格"></div>`。
3. 四段對白已經寫在該頁摘要帶，可作校對用。

## 已知風險

模型生成的中文**經常出錯**（現有兩套分鏡就是這樣，江湖錄的說明框整段是亂碼）。
建議做法：prompt 裡叫它畫**空白對白框**，中文改用後期加字，這樣字一定正確、
而且可以隨時改文案。把 Panel 說明裡的 speech bubble 內容改成
`empty white speech bubble, no text` 即可。
