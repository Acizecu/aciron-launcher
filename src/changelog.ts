

import type { Lang } from "./i18n";

export type ChangeItem = Record<Lang, { title: string; body: string }>;

export type ChangelogEntry = {
  version: string;

  date: string;
  added: ChangeItem[];
  fixed: Record<Lang, string>[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.1.1",
    date: "2026-08-30",
    added: [
      {
        ru: {
          title: "Объявления сверху окна",
          body:
            "Когда на серверах профилактика или вышло что-то, о чём стоит знать, над окном появляется полоса с текстом. " +
            "Её можно скрыть, и она не вернётся, пока не появится следующее объявление.",
        },
        en: {
          title: "Announcements above the window",
          body:
            "When there is maintenance or something worth knowing, a strip appears above the window. " +
            "You can hide it, and it stays hidden until the next announcement.",
        },
        tr: {
          title: "Pencerenin üstünde duyurular",
          body:
            "Sunucularda bakım olduğunda ya da bilmeniz gereken bir şey çıktığında pencerenin üstünde bir şerit belirir. " +
            "Gizleyebilirsiniz, bir sonraki duyuruya kadar geri gelmez.",
        },
      },
      {
        ru: {
          title: "Сообщения от Aciron",
          body:
            "В списке контактов закреплён аккаунт Aciron с галочкой — через него приходят объявления. " +
            "Писать ему нельзя, он только рассылает. В друзьях он не числится и на счётчик друзей не влияет.",
        },
        en: {
          title: "Messages from Aciron",
          body:
            "The Aciron account is pinned at the top of your contacts with a check mark, and announcements arrive there. " +
            "You cannot write to it. It does not count as a friend.",
        },
        tr: {
          title: "Aciron'dan mesajlar",
          body:
            "Aciron hesabı kişi listenizin en üstünde sabit duruyor, yanında onay işareti var; duyurular oradan gelir. " +
            "Ona yazamazsınız ve arkadaş sayınıza dahil değildir.",
        },
      },
      {
        ru: {
          title: "Вход по коду из Telegram",
          body:
            "Привяжите Telegram в кабинете на id.aciron.pro, и при входе можно будет получить код от бота. " +
            "Приложение-аутентификатор при этом заводить не обязательно: Telegram работает как самостоятельный второй фактор.",
        },
        en: {
          title: "Sign in with a Telegram code",
          body:
            "Link Telegram in your account at id.aciron.pro and you can get a sign-in code from the bot. " +
            "You do not need an authenticator app: Telegram works as a second factor on its own.",
        },
        tr: {
          title: "Telegram kodu ile giriş",
          body:
            "id.aciron.pro üzerindeki hesabınızda Telegram'ı bağlayın, girişte bottan kod alabilirsiniz. " +
            "Kimlik doğrulama uygulaması kurmanız şart değil: Telegram tek başına ikinci faktör olarak çalışır.",
        },
      },
    ],
    fixed: [
      {
        ru:
          "Отчёты о сбоях уходили в никуда: на сервере не было приёмника, и лаунчер удалял отчёт после первой же попытки. " +
          "Теперь они доходят, а те, что скопились, отправятся при запуске.",
        en:
          "Crash reports went nowhere: the server had no receiver, and the launcher dropped each report after the first attempt. " +
          "They arrive now, and whatever piled up is sent at startup.",
        tr:
          "Çökme raporları hiçbir yere gitmiyordu: sunucuda alıcı yoktu ve başlatıcı her raporu ilk denemeden sonra siliyordu. " +
          "Artık ulaşıyorlar, biriken raporlar açılışta gönderilir.",
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-08-29",
    added: [
      {
        ru: {
          title: "Полное описание мода",
          body:
            "Страница мода показывает описание с Modrinth, CurseForge и FTB целиком. " +
            "Раньше там были первые две строки и предложение открыть сайт. " +
            "Рядом теперь лицензия, нужен ли мод на сервере, поддерживаемые версии игры и загрузчики.",
        },
        en: {
          title: "Full mod description",
          body:
            "The mod page shows the whole description from Modrinth, CurseForge and FTB. " +
            "Before it showed two lines and a link to the site. " +
            "Alongside it: the license, whether the mod is needed on the server, supported game versions and loaders.",
        },
        tr: {
          title: "Modun tam açıklaması",
          body:
            "Mod sayfası Modrinth, CurseForge ve FTB açıklamasını tamamen gösteriyor. " +
            "Önceden iki satır ve siteye bir bağlantı vardı. " +
            "Yanında lisans, modun sunucuda gerekip gerekmediği, desteklenen oyun sürümleri ve yükleyiciler var.",
        },
      },
      {
        ru: {
          title: "Ссылка на лог игры",
          body:
            "Кнопка «Создать лог» в консоли выкладывает лог на log.aciron.pro и даёт короткую ссылку. " +
            "На странице сверху написано, что упало и из-за какого мода. Ссылка работает 12 часов. " +
            "Токен входа и путь к вашим папкам из лога вырезаются, ник остаётся.",
        },
        en: {
          title: "Share the game log by link",
          body:
            "The Share log button in the console uploads the log to log.aciron.pro and gives you a short link. " +
            "The page opens with what crashed and which mod caused it. The link works for 12 hours. " +
            "Your session token and folder paths are stripped from the log; your username stays.",
        },
        tr: {
          title: "Oyun logunu bağlantıyla paylaş",
          body:
            "Konsoldaki «Logu paylaş» düğmesi logu log.aciron.pro adresine yükler ve kısa bir bağlantı verir. " +
            "Sayfanın başında neyin çöktüğü ve hangi modun sebep olduğu yazar. Bağlantı 12 saat çalışır. " +
            "Oturum tokeni ve klasör yollarınız logdan çıkarılır, kullanıcı adınız kalır.",
        },
      },
      {
        ru: {
          title: "Отчёты о сбоях",
          body:
            "Лаунчер анонимно сообщает о своих падениях: настройки → «Лаунчер» → «Отчёты о сбоях». " +
            "Ник, почта, токены и пути к вашим папкам не отправляются, " +
            "кнопка «Что отправляется» показывает готовый отчёт целиком. Выключается одним нажатием.",
        },
        en: {
          title: "Crash reports",
          body:
            "The launcher reports its own crashes anonymously: Settings → Launcher → Crash reports. " +
            "Your username, email, tokens and folder paths are never sent, " +
            "and the What gets sent button shows you the whole report. One click turns it off.",
        },
        tr: {
          title: "Çökme raporları",
          body:
            "Başlatıcı kendi çökmelerini anonim olarak bildirir: Ayarlar → Başlatıcı → Çökme raporları. " +
            "Kullanıcı adınız, e-posta, tokenlar ve klasör yollarınız gönderilmez, " +
            "«Ne gönderiliyor» düğmesi raporun tamamını gösterir. Tek tıkla kapanır.",
        },
      },
      {
        ru: {
          title: "Обновления ставятся сами",
          body:
            "Окно запуска не только проверяет обновление, но и ставит его: видно загрузку с процентами " +
            "и установку. Версию, которую вы пропустили или отложили, лаунчер не трогает — для неё " +
            "остаётся кнопка в шапке.",
        },
        en: {
          title: "Updates install themselves",
          body:
            "The startup window now installs the update as well as checking for it, showing the download " +
            "percentage and the install step. A version you skipped or deferred is left alone — the button " +
            "in the header still handles those.",
        },
        tr: {
          title: "Güncellemeler kendiliğinden kuruluyor",
          body:
            "Açılış penceresi güncellemeyi yalnızca kontrol etmiyor, kuruyor da: indirme yüzdesi ve kurulum " +
            "adımı görünüyor. Atladığınız veya ertelediğiniz sürüme dokunmaz — onun için başlıktaki düğme kalır.",
        },
      },
      {
        ru: {
          title: "Значок в трее и запуск с Windows",
          body:
            "Настройки → «Лаунчер» → «Запускать вместе с Windows»: лаунчер стартует значком в трее, без окна. " +
            "Туда же он теперь уходит на время игры, если включено «Скрывать лаунчер при запуске игры» — " +
            "раньше окно просто пропадало, и вернуть его до конца игры было нельзя.",
        },
        en: {
          title: "Tray icon and start with Windows",
          body:
            "Settings → Launcher → Start with Windows: the launcher starts as a tray icon, with no window. " +
            "It also goes there while you play if Hide launcher on game start is on — the window used to " +
            "just disappear with no way back until the game closed.",
        },
        tr: {
          title: "Tepsi simgesi ve Windows ile başlatma",
          body:
            "Ayarlar → Başlatıcı → «Windows ile başlat»: başlatıcı pencere açmadan tepsi simgesi olarak başlar. " +
            "«Oyun başlarken başlatıcıyı gizle» açıksa oyun sırasında da oraya iner — önceden pencere sadece " +
            "kayboluyordu ve oyun kapanana kadar geri getirilemiyordu.",
        },
      },
    ],
    fixed: [
      {
        ru: "Выход из сборки и повторный вход открывал карточку мода вместо содержимого сборки, причём мода из прошлой сборки.",
        en: "Leaving an instance and opening it again showed a mod page instead of the instance, and it was a mod from the previous instance.",
        tr: "Bir derlemeden çıkıp tekrar girince derleme yerine mod kartı açılıyordu, üstelik önceki derlemenin modu.",
      },
      {
        ru: "У модов с CurseForge кнопка предлагала «Скачать», даже когда мод уже стоял в сборке.",
        en: "CurseForge mods offered Download even when the mod was already installed.",
        tr: "CurseForge modlarında mod zaten kuruluyken bile «İndir» yazıyordu.",
      },
      {
        ru: "Файл, брошенный на страницу мода, молча уезжал в сборку: ни подсветки, ни ответа.",
        en: "A file dropped on a mod page went into the instance silently, with no highlight and no confirmation.",
        tr: "Mod sayfasına bırakılan dosya sessizce derlemeye gidiyordu: ne vurgu ne yanıt.",
      },
      {
        ru: "В списке поддерживаемых версий игры показывались самые старые вместо свежих.",
        en: "The supported game versions list showed the oldest versions instead of the newest.",
        tr: "Desteklenen oyun sürümleri listesinde en yeniler yerine en eskiler görünüyordu.",
      },
      {
        ru: "Ссылки внутри описаний с CurseForge не открывались по клику.",
        en: "Links inside CurseForge descriptions did nothing when clicked.",
        tr: "CurseForge açıklamalarındaki bağlantılar tıklayınca açılmıyordu.",
      },
    ],
  },
];

export function changesFor(version: string): ChangelogEntry | undefined {
  return CHANGELOG.find((c) => c.version === version);
}
