

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
