const SUPPORTED = ["fa", "en", "nl"];

export function normalizeLang(input) {
  const v = String(input || "").trim().toLowerCase();
  return SUPPORTED.includes(v) ? v : "fa";
}

const DICT = {
  fa: {
    dir: "rtl",
    htmlLang: "fa",
    excel: {
      sheetName: "نامه‌ها",
      rightToLeft: true,
      headers: [
        "شماره",
        "فرستنده",
        "گیرنده",
        "تاریخ",
        "موضوع",
        "خلاصه کوتاه",
        "توضیحات کامل",
        "اقدام مورد نیاز",
        "نام فایل",
      ],
    },
    tools: {
      list: {
        title: "فهرست نامه‌های جدید",
        description: "فهرست تمام تصاویر نامه که هنوز پردازش نشده‌اند را برمی‌گرداند",
        found: (n) => `تعداد ${n} نامه جدید یافت شد:`,
        empty: "هیچ نامه جدیدی در پوشه ورودی نیست.",
      },
      image: {
        title: "دریافت تصویر نامه",
        description: "محتوای تصویر یک نامه مشخص (از خروجی list_new_letters) را برای خواندن برمی‌گرداند",
        filenameArg: "نام فایل، دقیقاً از خروجی list_new_letters",
      },
      save: {
        title: "ذخیره نتایج نامه‌ها",
        description:
          "نتایج خلاصه‌سازی یک یا چند نامه را در فایل اکسل ذخیره می‌کند و تصاویر پردازش‌شده را به پوشه آرشیو منتقل می‌کند",
        result: (n, output) => `${n} نامه ذخیره و آرشیو شد. فایل خروجی: ${output}`,
      },
      qr: {
        title: "دریافت QR کد آپلود موبایل",
        description: "یک QR کد نمایش می‌دهد که با اسکن آن از موبایل می‌توان مستقیم عکس نامه فرستاد",
        result: (url) =>
          `برای آپلود از موبایل، این QR را اسکن کن یا این آدرس را در مرورگر گوشی باز کن (گوشی باید در همان وای‌فای سیستم باشد): ${url}`,
      },
    },
    prompt: {
      title: "پردازش نامه‌های جدید",
      description: "خواندن، خلاصه‌سازی و ذخیره تمام نامه‌های جدید موجود در پوشه ورودی",
      instructions: `نامه‌های جدید موجود در پوشه ورودی را پردازش کن. نامه‌ها ممکن است به فارسی، انگلیسی یا هلندی نوشته شده باشند؛ محتوا را به هر زبانی که هست بخوان، اما خروجی زیر را همیشه به فارسی بنویس. مراحل دقیق زیر را دنبال کن:

۱. با ابزار list_new_letters فهرست نامه‌های جدید را بگیر.
۲. برای هر نامه، با ابزار get_letter_image تصویرش را بخوان.
۳. برای هر نامه، دقیقاً با این قالب یک بلوک بساز:

### نامه [شماره]
- فرستنده: [نام یا «نامشخص»]
- گیرنده: [نام یا «نامشخص»]
- تاریخ: [تاریخ یا «نامشخص»]
- موضوع: [موضوع اصلی نامه در یک عبارت کوتاه]
- خلاصه کوتاه: [۲ تا ۳ جمله که چکیده محتوای نامه را می‌رساند]
- توضیحات کامل: [یک تا دو پاراگراف؛ جزئیات مهم، لحن نامه، زمینه و نکات کلیدی]
- اقدام یا درخواست مورد نیاز: [آنچه از گیرنده خواسته شده، یا «ندارد»]

قوانین مهم:
- هرگز حدس نزن. اگر بخشی ناخوانا یا مبهم است، دقیقاً بنویس [ناخوانا] یا [نامشخص].
- اگر کیفیت عکس برای خواندن کافی نیست، همان‌جا بگو کدام نامه نیاز به عکس واضح‌تر دارد.
- خروجی فقط بر اساس متن واقعی نامه باشد، نه حدس یا فرض.

۴. پس از پردازش همه نامه‌ها، تمام بلوک‌های بالا را به ترتیب نمایش بده و یک جدول خلاصه با ستون‌های شماره | فرستنده | گیرنده | تاریخ | موضوع | خلاصه کوتاه | اقدام مورد نیاز بساز.
۵. سپس با ابزار save_letter_results، نتایج تمام نامه‌ها را یک‌جا ذخیره کن (این ابزار خودش فایل اکسل را به‌روزرسانی و عکس‌ها را آرشیو می‌کند).
۶. اگر پوشه ورودی خالی بود، همین را به کاربر اطلاع بده و کاری انجام نده.`,
    },
    upload: {
      pageTitle: "آپلود نامه",
      icon: "✉️",
      title: "آپلود عکس نامه",
      subtitle:
        "عکس یا اسکن نامه را بگیر یا از گالری انتخاب کن. مستقیم به پوشه ورودی روی سیستم فرستاده می‌شود؛ می‌توانی چند عکس را با هم انتخاب کنی.",
      button: "گرفتن یا انتخاب عکس",
      sending: "در حال ارسال...",
      okTemplate: "{n} عکس با موفقیت ارسال شد ✓",
      partialTemplate: "{ok} از {total} عکس ارسال شد.",
    },
  },

  en: {
    dir: "ltr",
    htmlLang: "en",
    excel: {
      sheetName: "Letters",
      rightToLeft: false,
      headers: [
        "No.",
        "Sender",
        "Recipient",
        "Date",
        "Subject",
        "Short Summary",
        "Full Description",
        "Action Needed",
        "Filename",
      ],
    },
    tools: {
      list: {
        title: "List new letters",
        description: "Returns the list of letter images that haven't been processed yet",
        found: (n) => `Found ${n} new letter(s):`,
        empty: "No new letters in the inbox folder.",
      },
      image: {
        title: "Get letter image",
        description: "Returns the image content of a specific letter (from list_new_letters output) so it can be read",
        filenameArg: "Filename, exactly as returned by list_new_letters",
      },
      save: {
        title: "Save letter results",
        description:
          "Saves the summarized results of one or more letters into the Excel file and archives the processed images",
        result: (n, output) => `${n} letter(s) saved and archived. Output file: ${output}`,
      },
      qr: {
        title: "Get mobile upload QR code",
        description: "Shows a QR code that lets you send a letter photo directly from your phone by scanning it",
        result: (url) =>
          `To upload from your phone, scan this QR code or open this address in your phone's browser (phone must be on the same Wi-Fi): ${url}`,
      },
    },
    prompt: {
      title: "Process new letters",
      description: "Read, summarize, and save all new letters in the inbox folder",
      instructions: `Process the new letters in the inbox folder. Letters may be written in Persian (Farsi), English, or Dutch — read the content in whatever language it's written in, but always write the output below in English. Follow these exact steps:

1. Use the list_new_letters tool to get the list of new letters.
2. For each letter, use the get_letter_image tool to read its image.
3. For each letter, build exactly one block in this format:

### Letter [number]
- Sender: [name or "Unknown"]
- Recipient: [name or "Unknown"]
- Date: [date or "Unknown"]
- Subject: [the letter's main subject in one short phrase]
- Short summary: [2-3 sentences capturing the gist of the letter]
- Full description: [one to two paragraphs; key details, tone, context, and important points]
- Action needed: [what is being requested from the recipient, or "None"]

Important rules:
- Never guess. If a part is illegible or unclear, write exactly [illegible] or [unclear].
- If the photo quality isn't good enough to read, say right there which letter needs a clearer photo.
- Base the output only on the letter's actual text, not assumptions.

4. After processing all letters, show all the blocks above in order, then build a summary table with columns: No. | Sender | Recipient | Date | Subject | Short Summary | Action Needed.
5. Then use the save_letter_results tool to save all the results at once (this tool updates the Excel file and archives the images itself).
6. If the inbox folder is empty, just tell the user that and do nothing else.`,
    },
    upload: {
      pageTitle: "Letter Upload",
      icon: "✉️",
      title: "Upload letter photo",
      subtitle:
        "Take a photo or scan of the letter, or pick one from your gallery. It goes straight to the inbox folder on your computer; you can select several photos at once.",
      button: "Take or choose photo",
      sending: "Uploading...",
      okTemplate: "{n} photo(s) uploaded successfully ✓",
      partialTemplate: "{ok} of {total} photo(s) uploaded.",
    },
  },

  nl: {
    dir: "ltr",
    htmlLang: "nl",
    excel: {
      sheetName: "Brieven",
      rightToLeft: false,
      headers: [
        "Nr.",
        "Afzender",
        "Ontvanger",
        "Datum",
        "Onderwerp",
        "Korte samenvatting",
        "Volledige beschrijving",
        "Actie vereist",
        "Bestandsnaam",
      ],
    },
    tools: {
      list: {
        title: "Nieuwe brieven weergeven",
        description: "Geeft de lijst met brievenfoto's die nog niet verwerkt zijn",
        found: (n) => `${n} nieuwe brief/brieven gevonden:`,
        empty: "Geen nieuwe brieven in de inbox-map.",
      },
      image: {
        title: "Brief-afbeelding ophalen",
        description: "Geeft de afbeelding van een specifieke brief (uit de output van list_new_letters) terug om te lezen",
        filenameArg: "Bestandsnaam, precies zoals teruggegeven door list_new_letters",
      },
      save: {
        title: "Briefresultaten opslaan",
        description:
          "Slaat de samengevatte resultaten van een of meer brieven op in het Excel-bestand en archiveert de verwerkte afbeeldingen",
        result: (n, output) => `${n} brief/brieven opgeslagen en gearchiveerd. Uitvoerbestand: ${output}`,
      },
      qr: {
        title: "QR-code voor mobiele upload ophalen",
        description: "Toont een QR-code waarmee je direct een foto van een brief vanaf je telefoon kunt versturen",
        result: (url) =>
          `Scan deze QR-code om vanaf je telefoon te uploaden, of open dit adres in de browser van je telefoon (telefoon moet op hetzelfde wifi-netwerk zitten): ${url}`,
      },
    },
    prompt: {
      title: "Nieuwe brieven verwerken",
      description: "Alle nieuwe brieven in de inbox-map lezen, samenvatten en opslaan",
      instructions: `Verwerk de nieuwe brieven in de inbox-map. Brieven kunnen in het Perzisch (Farsi), Engels of Nederlands geschreven zijn — lees de inhoud in de taal waarin die geschreven is, maar schrijf de onderstaande uitvoer altijd in het Nederlands. Volg deze exacte stappen:

1. Gebruik de tool list_new_letters om de lijst met nieuwe brieven op te halen.
2. Lees voor elke brief de afbeelding met de tool get_letter_image.
3. Maak voor elke brief precies één blok in dit format:

### Brief [nummer]
- Afzender: [naam of "Onbekend"]
- Ontvanger: [naam of "Onbekend"]
- Datum: [datum of "Onbekend"]
- Onderwerp: [het hoofdonderwerp van de brief in één korte zin]
- Korte samenvatting: [2-3 zinnen die de kern van de brief weergeven]
- Volledige beschrijving: [één tot twee alinea's; belangrijke details, toon, context en kernpunten]
- Actie vereist: [wat er van de ontvanger gevraagd wordt, of "Geen"]

Belangrijke regels:
- Raad nooit. Als een deel onleesbaar of onduidelijk is, schrijf dan precies [onleesbaar] of [onduidelijk].
- Als de fotokwaliteit niet goed genoeg is om te lezen, meld dan direct welke brief een duidelijkere foto nodig heeft.
- Baseer de uitvoer alleen op de daadwerkelijke tekst van de brief, niet op aannames.

4. Toon na het verwerken van alle brieven alle bovenstaande blokken in volgorde, en maak daarna een samenvattende tabel met kolommen: Nr. | Afzender | Ontvanger | Datum | Onderwerp | Korte samenvatting | Actie vereist.
5. Gebruik vervolgens de tool save_letter_results om alle resultaten in één keer op te slaan (deze tool werkt zelf het Excel-bestand bij en archiveert de afbeeldingen).
6. Als de inbox-map leeg is, meld dat dan gewoon aan de gebruiker en doe verder niets.`,
    },
    upload: {
      pageTitle: "Brief uploaden",
      icon: "✉️",
      title: "Foto van brief uploaden",
      subtitle:
        "Maak een foto of scan van de brief, of kies er een uit je galerij. Deze wordt direct naar de inbox-map op je computer gestuurd; je kunt meerdere foto's tegelijk selecteren.",
      button: "Foto maken of kiezen",
      sending: "Bezig met uploaden...",
      okTemplate: "{n} foto('s) succesvol geüpload ✓",
      partialTemplate: "{ok} van {total} foto('s) geüpload.",
    },
  },
};

export function getStrings(lang) {
  return DICT[normalizeLang(lang)];
}
