

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
    version: "1.1.4",
    date: "2026-09-16",
    added: [
      {
        ru: {
          title: "OptiFine ставится галочкой",
          body:
            "При создании сборки на Forge появилась отметка «Поставить OptiFine». Лаунчер возьмёт свежую " +
            "сборку с optifine.net и положит её в папку модов. К Fabric так поставить нельзя, ему нужен ещё OptiFabric.",
        },
        en: {
          title: "OptiFine in one tick",
          body:
            "New Forge builds have an «Install OptiFine» box. The launcher takes the latest build from " +
            "optifine.net and puts it into the mods folder. Fabric also needs OptiFabric, so the box is Forge only.",
        },
        tr: {
          title: "OptiFine tek kutucukla",
          body:
            "Forge ile sürüm oluştururken «OptiFine kur» kutucuğu çıkıyor. Başlatıcı en yeni sürümü " +
            "optifine.net üzerinden alıp mods klasörüne koyuyor. Fabric için ayrıca OptiFabric gerekir, bu yüzden kutucuk yalnızca Forge'da.",
        },
      },
      {
        ru: {
          title: "Только подходящие версии игры",
          body:
            "Список версий теперь зависит от выбранного ядра. Если выбран Fabric, версий, под которые он " +
            "не выходил, в списке не будет. Раньше это выяснялось только на запуске, после минуты скачивания.",
        },
        en: {
          title: "Only versions the loader supports",
          body:
            "The version list now follows the loader you picked. With Fabric you no longer see versions it " +
            "never supported. Before, you found out only at launch, after a minute of downloading.",
        },
        tr: {
          title: "Yalnızca yükleyicinin desteklediği sürümler",
          body:
            "Sürüm listesi artık seçtiğiniz yükleyiciye göre daralıyor. Fabric seçiliyse, desteklemediği " +
            "sürümler listede görünmüyor. Eskiden bu ancak oyunu başlatınca, bir dakikalık indirmeden sonra anlaşılıyordu.",
        },
      },
      {
        ru: {
          title: "Своя палитра и фон карточками",
          body:
            "Цвет темы выбирается в палитре лаунчера вместо системного окна Windows. Нажмите на кружок " +
            "рядом с настройкой, и под ним откроется палитра с полем для кода цвета. Живой фон спрятан " +
            "в раскрывающийся список, варианты в нём показаны карточками, как у тем.",
        },
        en: {
          title: "Our own colour picker, backgrounds as cards",
          body:
            "Theme colours open the launcher's own picker instead of the Windows dialog. Click the circle next " +
            "to a setting and the picker opens right under it, with a field for the colour code. Live backgrounds " +
            "moved into a dropdown, shown as cards like the themes.",
        },
        tr: {
          title: "Kendi renk seçicimiz, kart hâlinde arka planlar",
          body:
            "Tema rengi artık Windows penceresi yerine başlatıcının kendi paletinde seçiliyor. Ayarın yanındaki " +
            "daireye tıklayın, palet hemen altında renk kodu alanıyla açılır. Canlı arka planlar, temalar gibi " +
            "kartlarla gösterilen bir açılır listeye taşındı.",
        },
      },
    ],
    fixed: [
      {
        ru:
          "NeoForge иногда не запускался. Если хотя бы одна библиотека не докачалась, лаунчер молча собирал " +
          "неполный список файлов, и игра падала на старте. Теперь лаунчер повторяет загрузку, а если файла " +
          "всё равно нет, доустанавливает ядро.",
        en:
          "NeoForge sometimes refused to start. If even one library failed to download, the launcher quietly built " +
          "an incomplete file list and the game crashed on startup. Now the launcher retries the download, and if " +
          "a file is still missing it reinstalls the loader.",
        tr:
          "NeoForge bazen başlamıyordu. Tek bir kitaplık bile inmediğinde başlatıcı sessizce eksik bir dosya " +
          "listesi kuruyor, oyun açılışta çöküyordu. Artık başlatıcı indirmeyi tekrarlıyor, dosya yine yoksa " +
          "çekirdeği yeniden kuruyor.",
      },
      {
        ru:
          "Если ставить несколько модов разом, часть из них пропадала из списка сборки, потому что каждая " +
          "установка записывала свой список поверх чужого. Теперь моды дописываются и больше не теряются.",
        en:
          "Installing several mods at once dropped some of them from the build, because each install wrote its " +
          "own list over the others. Mods are now added to the list and no longer get lost.",
        tr:
          "Aynı anda birkaç mod kurulduğunda bir kısmı sürüm listesinden kayboluyordu, çünkü her kurulum kendi " +
          "listesini diğerinin üzerine yazıyordu. Artık modlar listeye ekleniyor ve kaybolmuyor.",
      },
      {
        ru:
          "Если у игрока нет своего скина, фигурка не показывалась ни в карточке, ни в предпросмотре. " +
          "Теперь на её месте стандартный Стив или Алекс.",
        en:
          "A player without their own skin had no figure at all, neither on the card nor in the preview. " +
          "Now the default Steve or Alex stands there.",
        tr:
          "Kendi kaplaması olmayan oyuncunun karakteri ne kartta ne de önizlemede görünüyordu. " +
          "Artık yerinde varsayılan Steve ya da Alex duruyor.",
      },
      {
        ru: "Картинку, выбранную при создании сборки, не было видно в окне создания.",
        en: "The picture you chose while creating a build did not show in the creation window.",
        tr: "Sürüm oluştururken seçilen görsel, oluşturma penceresinde görünmüyordu.",
      },
      {
        ru:
          "Если сеть подводила, каталог модов показывал длинную английскую ошибку с адресом запроса. " +
          "Теперь лаунчер сам повторяет сорвавшийся поиск, а если и это не помогло, пишет понятно, " +
          "в чём дело, например что сервер не ответил.",
        en:
          "When the network failed, the mod catalogue showed a long English error with the request address. " +
          "The launcher now retries a failed search on its own, and if that does not help it says plainly what " +
          "went wrong, for example that the server did not answer.",
        tr:
          "Ağ sorun çıkardığında mod kataloğu, istek adresini içeren uzun bir İngilizce hata gösteriyordu. " +
          "Artık başlatıcı başarısız aramayı kendisi tekrarlıyor, bu da işe yaramazsa sorunu anlaşılır biçimde " +
          "yazıyor, örneğin sunucunun yanıt vermediğini.",
      },
      {
        ru:
          "Windows 11 рисовала вокруг окна тонкую светлую рамку, которая не совпадала со скруглёнными углами. " +
          "Рамки больше нет.",
        en:
          "Windows 11 drew a thin light border around the window that did not line up with the rounded corners. " +
          "The border is gone.",
        tr:
          "Windows 11 pencerenin çevresine yuvarlak köşelerle örtüşmeyen ince, açık renkli bir çerçeve çiziyordu. " +
          "Çerçeve artık yok.",
      },
    ],
  },
  {
    version: "1.1.3",
    date: "2026-09-05",
    added: [
      {
        ru: {
          title: "Галочка у подтверждённых аккаунтов",
          body:
            "Рядом с ником появляется галочка, если аккаунт подтверждён. Она видна в списке друзей, в переписке, " +
            "в карточке игрока и в заявках — так понятно, что пишет тот, за кого себя выдаёт, а не похожий ник.",
        },
        en: {
          title: "A badge for verified accounts",
          body:
            "A check mark now sits next to the name of a verified account. You will see it in the friend list, in chat, " +
            "on the player card and in requests — so you can tell the real person from a lookalike name.",
        },
        tr: {
          title: "Doğrulanmış hesaplarda rozet",
          body:
            "Hesap doğrulanmışsa adının yanında bir onay işareti çıkıyor. Arkadaş listesinde, sohbette, oyuncu kartında " +
            "ve isteklerde görünür — böylece benzer bir adı değil, gerçek kişiyi ayırt edersiniz.",
        },
      },
      {
        ru: {
          title: "Два плаща в гардеробе",
          body:
            "В общем каталоге появились плащи Hero и Twisted — дизайн Mojang. Оба лежат на вкладке «Плащи» " +
            "и надеваются одним нажатием.",
        },
        en: {
          title: "Two more capes in the wardrobe",
          body:
            "The Hero and Twisted capes, both Mojang designs, are now in the shared catalogue. Look for them on " +
            "the Capes tab and put one on with a single click.",
        },
        tr: {
          title: "Gardıropta iki pelerin daha",
          body:
            "Ortak katalogda artık Hero ve Twisted pelerinleri var, ikisi de Mojang tasarımı. «Pelerinler» " +
            "sekmesinde duruyorlar ve tek tıkla giyiliyorlar.",
        },
      },
    ],
    fixed: [],
  },
  {
    version: "1.1.2",
    date: "2026-08-30",
    added: [],
    fixed: [
      {
        ru:
          "Полоса объявления менялась только после перезапуска: лаунчер спрашивал сервер раз в десять минут. " +
          "Теперь сервер сам сообщает об изменении, и полоса появляется и гаснет сразу.",
        en:
          "The announcement strip only changed after a restart: the launcher asked the server every ten minutes. " +
          "The server now says when something changes, so the strip appears and disappears right away.",
        tr:
          "Duyuru şeridi yalnızca yeniden başlatınca değişiyordu: başlatıcı sunucuya on dakikada bir soruyordu. " +
          "Artık sunucu değişikliği kendisi bildiriyor, şerit anında beliriyor ve kayboluyor.",
      },
    ],
  },
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
