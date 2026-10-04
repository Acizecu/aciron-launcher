

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
    version: "1.3.7",
    date: "2026-10-04",
    added: [
      {
        ru: {
          title: "Анимированные плащи в игре",
          body: "Плащи из гардероба теперь анимируются в Minecraft. Скорость, порядок кадров и режим воспроизведения совпадают с предпросмотром. После обновления лаунчера перезапустите игру.",
        },
        en: {
          title: "Animated capes in the game",
          body: "Wardrobe capes now animate in Minecraft. Speed, frame order and playback mode match the preview. Restart the game after updating the launcher.",
        },
        tr: {
          title: "Oyunda animasyonlu pelerinler",
          body: "Gardıroptaki pelerinler artık Minecraft'ta hareket ediyor. Hız, kare sırası ve oynatma modu önizlemeyle aynı. Başlatıcıyı güncelledikten sonra oyunu yeniden başlat.",
        },
      },
    ],
    fixed: [],
  },
  {
    version: "1.3.6",
    date: "2026-10-02",
    added: [
      {
        ru: {
          title: "Картинка уходит после подтверждения",
          body: "Перед отправкой картинки открывается окно с предпросмотром и полем для подписи. Картинка, случайно вставленная через Ctrl+V, больше не улетает собеседнику сразу.",
        },
        en: {
          title: "Images wait for your confirmation",
          body: "Before an image is sent, a window shows a preview and a caption field. An image pasted by accident with Ctrl+V no longer goes straight to the other person.",
        },
        tr: {
          title: "Görsel onaydan sonra gidiyor",
          body: "Görsel gönderilmeden önce önizleme ve açıklama alanı olan bir pencere açılıyor. Ctrl+V ile yanlışlıkla yapıştırılan görsel artık karşı tarafa hemen gitmiyor.",
        },
      },
      {
        ru: {
          title: "Уведомления складываются стопкой",
          body: "Новое уведомление ложится поверх прежних, а те выглядывают из-под него. Наведите мышь, чтобы раскрыть стопку. Пока лаунчер стоит за игрой, уведомления не пропадают и ждут вас.",
        },
        en: {
          title: "Notifications stack up",
          body: "A new notification lands on top of the older ones, which peek out from underneath. Hover to expand the stack. While the launcher sits behind the game, notifications don't disappear and wait for you.",
        },
        tr: {
          title: "Bildirimler üst üste diziliyor",
          body: "Yeni bildirim eskilerin üstüne düşüyor, eskiler altından görünüyor. Yığını açmak için fareyi üzerine getir. Başlatıcı oyunun arkasındayken bildirimler kaybolmuyor, seni bekliyor.",
        },
      },
      {
        ru: {
          title: "Прозрачные плащи",
          body: "Прозрачные и полупрозрачные пиксели плаща видны в игре и в гардеробе. Раньше на их месте была чёрная заливка.",
        },
        en: {
          title: "Transparent capes",
          body: "Transparent and semi-transparent cape pixels now show in the game and in the wardrobe. They used to be filled with black.",
        },
        tr: {
          title: "Saydam pelerinler",
          body: "Pelerindeki saydam ve yarı saydam pikseller artık oyunda ve gardıropta görünüyor. Eskiden yerlerinde siyah dolgu vardı.",
        },
      },
    ],
    fixed: [
      {
        ru: "Меню по правой кнопке в чате открывается у курсора, а не в стороне. У меню новый вид и строка быстрых реакций.",
        en: "The right-click menu in chat opens at the cursor instead of off to the side. The menu has a new look and a row of quick reactions.",
        tr: "Sohbetteki sağ tık menüsü artık kenarda değil, imlecin yanında açılıyor. Menünün yeni bir görünümü ve hızlı tepki satırı var.",
      },
      {
        ru: "Ответ на картинку показывает её миниатюру. Раньше под именем автора было пусто.",
        en: "A reply to an image shows its thumbnail. Before, there was nothing under the author's name.",
        tr: "Bir görsele verilen yanıt artık görselin küçük resmini gösteriyor. Önceden yazarın adının altı boştu.",
      },
      {
        ru: "Окно лаунчера без фокуса больше не тратит ресурсы на анимации. Интерфейс замирает и продолжает с того же места, когда вы к нему вернётесь.",
        en: "An unfocused launcher window no longer spends resources on animations. The interface pauses and picks up where it left off when you come back.",
        tr: "Odakta olmayan başlatıcı penceresi artık animasyonlara kaynak harcamıyor. Arayüz duruyor ve geri döndüğünde kaldığı yerden devam ediyor.",
      },
    ],
  },
  {
    version: "1.3.5",
    date: "2026-09-30",
    added: [],
    fixed: [
      {
        ru: "Лаунчер больше не нагружает видеокарту, пока вы играете. Живой фон и 3D-модель в гардеробе замирают, когда запущена игра или окно лаунчера не в фокусе. На встроенной графике из-за этого могла подтормаживать сама игра.",
        en: "The launcher no longer loads the graphics card while you play. The live background and the 3D model in the wardrobe pause while the game is running or the launcher window isn't focused. On integrated graphics this could make the game itself stutter.",
        tr: "Başlatıcı artık sen oynarken ekran kartını yormuyor. Oyun açıkken ya da başlatıcı penceresi odakta değilken canlı arka plan ve gardıroptaki 3D model duruyor. Dahili grafikte bu yüzden oyunun kendisi takılabiliyordu.",
      },
    ],
  },
  {
    version: "1.3.4",
    date: "2026-09-30",
    added: [],
    fixed: [
      {
        ru: "Игра больше не замирает при входе на сервер с большим числом игроков. В 1.3.3 загрузка скинов Aciron могла останавливать игру, а на медленном интернете FPS падал почти до нуля.",
        en: "The game no longer freezes when you join a server with many players. In 1.3.3 loading Aciron skins could stall the game, and on slow internet FPS dropped almost to zero.",
        tr: "Çok oyunculu bir sunucuya girerken oyun artık donmuyor. 1.3.3'te Aciron görünümlerinin yüklenmesi oyunu durdurabiliyordu, yavaş internette FPS neredeyse sıfıra düşüyordu.",
      },
      {
        ru: "Скины друзей теперь видны на NeoForge и других сборках, где раньше они иногда не появлялись до перезахода.",
        en: "Friends' skins now show up on NeoForge and other builds where they sometimes stayed missing until you rejoined.",
        tr: "Arkadaşlarının görünümleri artık NeoForge'da ve daha önce yeniden girene kadar bazen görünmediği diğer paketlerde de görünüyor.",
      },
      {
        ru: "Скины и плащи Aciron работают на Minecraft 26.3.",
        en: "Aciron skins and capes work on Minecraft 26.3.",
        tr: "Aciron görünümleri ve pelerinleri Minecraft 26.3'te çalışıyor.",
      },
    ],
  },
  {
    version: "1.3.3",
    date: "2026-09-30",
    added: [],
    fixed: [
      {
        ru: "Скины и плащи Aciron в игре снова появляются сразу. В 1.3.2 свой облик мог не подгрузиться до перезахода в мир.",
        en: "Aciron skins and capes show up in the game right away again. In 1.3.2 your own look could stay missing until you rejoined the world.",
        tr: "Aciron görünümleri ve pelerinleri oyunda yine hemen görünüyor. 1.3.2'de kendi görünümün dünyaya yeniden girene kadar yüklenmeyebiliyordu.",
      },
    ],
  },
  {
    version: "1.3.2",
    date: "2026-09-30",
    added: [
      {
        ru: {
          title: "Плащ лицензии можно снять",
          body:
            "В гардеробе, в разделе плащей с лицензии, появилась плитка «Снять плащ лицензии». Плащ снимается с аккаунта " +
            "Minecraft сразу, без кнопки «Сохранить», и надевается обратно той же плиткой.",
        },
        en: {
          title: "Take off the license cape",
          body:
            "The license capes section of the wardrobe has a «Take off the license cape» tile. The cape comes off the " +
            "Minecraft account right away, without pressing Save, and goes back on with the same tile.",
        },
        tr: {
          title: "Lisans pelerini çıkarılabiliyor",
          body:
            "Gardıropta lisans pelerinleri bölümüne «Lisans pelerinini çıkar» kutucuğu eklendi. Pelerin Minecraft " +
            "hesabından hemen, Kaydet'e basmadan çıkar ve aynı kutucukla geri takılır.",
        },
      },
      {
        ru: {
          title: "Плащи Aciron — первыми",
          body: "В гардеробе плащи Aciron теперь идут первыми, за ними твои загруженные, потом плащи в стиле Mojang.",
        },
        en: {
          title: "Aciron capes come first",
          body: "The wardrobe now lists Aciron capes first, then the ones you uploaded, then Mojang-style capes.",
        },
        tr: {
          title: "Önce Aciron pelerinleri",
          body: "Gardırop artık önce Aciron pelerinlerini, sonra senin yüklediklerini, sonra Mojang tarzı pelerinleri gösteriyor.",
        },
      },
      {
        ru: {
          title: "Баннеры серверов",
          body: "У серверов во вкладке «Серверы» может быть свой баннер. Его присылает владелец сервера, и он стоит фоном карточки.",
        },
        en: {
          title: "Server banners",
          body: "Servers in the Servers tab can have their own banner. The server owner sends it, and it sits behind the card.",
        },
        tr: {
          title: "Sunucu afişleri",
          body: "Sunucular sekmesindeki sunucuların kendi afişi olabiliyor. Afişi sunucu sahibi gönderiyor, kartın arka planında duruyor.",
        },
      },
    ],
    fixed: [
      {
        ru: "Скины и плащи Aciron в игре больше не подвешивают кадр. Раньше при появлении каждого нового игрока игра ждала ответ сервера, и на заполненном сервере это давало подёргивания.",
        en: "Aciron skins and capes no longer stall frames in the game. Before, the game waited for the server every time a new player came into view, which caused stutter on busy servers.",
        tr: "Aciron görünümleri ve pelerinleri oyunda artık kareyi dondurmuyor. Eskiden her yeni oyuncu göründüğünde oyun sunucunun cevabını bekliyordu ve kalabalık sunucularda takılmalar oluyordu.",
      },
      {
        ru: "Выбор плаща лицензии больше не пишет «свой плащ снять не удалось».",
        en: "Picking a license cape no longer says «your own cape could not be taken off».",
        tr: "Lisans pelerini seçmek artık «kendi pelerinin çıkarılamadı» demiyor.",
      },
      {
        ru: "Своя обложка сборки теперь видна и в статусе Discord, в том числе у обложек, поставленных раньше.",
        en: "Your own build cover now shows in the Discord status too, including covers set earlier.",
        tr: "Kendi derleme kapağın artık Discord durumunda da görünüyor, daha önce koyduğun kapaklar dahil.",
      },
    ],
  },
  {
    version: "1.3.1",
    date: "2026-09-30",
    added: [
      {
        ru: {
          title: "Вкладка «Скриншоты»",
          body:
            "Все скриншоты из игры собраны в одном месте и разложены по сборкам. Можно искать по имени, " +
            "открыть снимок на весь экран, показать его в папке или удалить. Файлы остаются только у тебя на компьютере.",
        },
        en: {
          title: "Screenshots tab",
          body:
            "All your in-game screenshots are in one place, grouped by build. Search by name, open a shot " +
            "full screen, show it in its folder or delete it. The files stay on your computer only.",
        },
        tr: {
          title: "Ekran görüntüleri sekmesi",
          body:
            "Oyunda aldığın tüm ekran görüntüleri tek yerde, derlemelere göre gruplanmış halde. Ada göre ara, " +
            "görüntüyü tam ekran aç, klasöründe göster ya da sil. Dosyalar yalnızca senin bilgisayarında kalır.",
        },
      },
      {
        ru: {
          title: "Серверы Aciron",
          body:
            "Во вкладке «Серверы» появились серверы, которые добавляет команда Aciron, с версией и описанием. " +
            "Часть из них лаунчер сам добавит в список серверов в игре. Новые серверы появляются без перезапуска лаунчера.",
        },
        en: {
          title: "Aciron servers",
          body:
            "The Servers tab now lists servers added by the Aciron team, with their version and description. " +
            "Some of them are also added to the in-game server list. New servers show up without restarting the launcher.",
        },
        tr: {
          title: "Aciron sunucuları",
          body:
            "Sunucular sekmesinde artık Aciron ekibinin eklediği sunucular sürüm ve açıklamalarıyla görünüyor. " +
            "Bazıları oyundaki sunucu listesine de ekleniyor. Yeni sunucular başlatıcıyı yeniden açmadan görünür.",
        },
      },
      {
        ru: {
          title: "Картинки в чате",
          body:
            "В личные сообщения можно отправить картинку кнопкой или вставить скриншот через Ctrl+V. " +
            "Размер до 4 МБ, с Aciron Plus до 10 МБ. Картинки хранятся 30 дней.",
        },
        en: {
          title: "Images in chat",
          body:
            "You can send an image in direct messages with the button or paste a screenshot with Ctrl+V. " +
            "Up to 4 MB, or 10 MB with Aciron Plus. Images are kept for 30 days.",
        },
        tr: {
          title: "Sohbette resimler",
          body:
            "Özel mesajlarda düğmeyle resim gönderebilir ya da Ctrl+V ile ekran görüntüsü yapıştırabilirsin. " +
            "En fazla 4 MB, Aciron Plus ile 10 MB. Resimler 30 gün saklanır.",
        },
      },
      {
        ru: {
          title: "Новый выбор эмодзи",
          body:
            "У выбора эмодзи появились поиск по-русски и по-английски, недавние сверху и разделы по темам. " +
            "По списку можно ходить стрелками и выбирать Enter.",
        },
        en: {
          title: "New emoji picker",
          body:
            "The emoji picker has search in Russian and English, recent emoji at the top and sections by topic. " +
            "Move through the list with the arrow keys and pick with Enter.",
        },
        tr: {
          title: "Yeni emoji seçici",
          body:
            "Emoji seçicide artık Rusça ve İngilizce arama, en üstte son kullanılanlar ve konulara göre bölümler var. " +
            "Listede ok tuşlarıyla gezinip Enter ile seçebilirsin.",
        },
      },
      {
        ru: {
          title: "Обложки сборок",
          body:
            "В последних запусках и в статусе Discord теперь картинка самой сборки: своя, если ты её ставил, " +
            "иначе официальная с Modrinth или CurseForge.",
        },
        en: {
          title: "Build covers",
          body:
            "Recent launches and your Discord status now show the build's own picture: yours if you set one, " +
            "otherwise the official one from Modrinth or CurseForge.",
        },
        tr: {
          title: "Derleme kapakları",
          body:
            "Son açılanlarda ve Discord durumunda artık derlemenin kendi resmi görünüyor: kendin koyduysan " +
            "seninki, yoksa Modrinth ya da CurseForge'daki resmi görsel.",
        },
      },
      {
        ru: {
          title: "Анимированные плащи",
          body: "В гардеробе появились плащи с анимацией. На модели игрока они двигаются так же, как в каталоге.",
        },
        en: {
          title: "Animated capes",
          body: "The wardrobe now has animated capes. They move on the player model the same way as in the catalog.",
        },
        tr: {
          title: "Hareketli pelerinler",
          body: "Gardıropta artık hareketli pelerinler var. Oyuncu modelinde katalogdaki gibi hareket ediyorlar.",
        },
      },
      {
        ru: {
          title: "Aciron Plus в лаунчере",
          body:
            "У подписчиков рядом с ником стоит значок Plus: в меню аккаунта, в друзьях и в профиле. " +
            "Рекламная карточка на главной у них больше не показывается.",
        },
        en: {
          title: "Aciron Plus in the launcher",
          body:
            "Subscribers get a Plus badge next to their nickname in the account menu, the friends list and profiles. " +
            "The promo card on the home screen is no longer shown to them.",
        },
        tr: {
          title: "Başlatıcıda Aciron Plus",
          body:
            "Abonelerin takma adının yanında Plus rozeti var: hesap menüsünde, arkadaş listesinde ve profilde. " +
            "Ana ekrandaki tanıtım kartı artık onlara gösterilmiyor.",
        },
      },
      {
        ru: {
          title: "Код при входе",
          body:
            "Если в Aciron ID включено «Требовать код при входе», после пароля лаунчер попросит код из письма " +
            "или от бота в Telegram. Код можно прислать ещё раз прямо из окна входа.",
        },
        en: {
          title: "Sign-in code",
          body:
            "If “Require a code at sign-in” is on in Aciron ID, the launcher asks for a code from your email " +
            "or the Telegram bot after the password. You can request the code again from the sign-in window.",
        },
        tr: {
          title: "Girişte kod",
          body:
            "Aciron ID'de «Girişte kod iste» açıksa, başlatıcı paroladan sonra e-postana ya da Telegram botuna " +
            "gelen kodu ister. Kodu giriş penceresinden yeniden isteyebilirsin.",
        },
      },
      {
        ru: {
          title: "Громкость звуков и консоль игры",
          body:
            "В настройках появился ползунок громкости для щелчков и уведомлений. В консоли игры ошибки и " +
            "предупреждения отмечены слева, а строки стека идут со сдвигом под своей ошибкой.",
        },
        en: {
          title: "Sound volume and game console",
          body:
            "Settings have a volume slider for clicks and notifications. In the game console, errors and warnings " +
            "are marked on the left, and stack trace lines are indented under their error.",
        },
        tr: {
          title: "Ses seviyesi ve oyun konsolu",
          body:
            "Ayarlarda tıklamalar ve bildirimler için ses kaydırıcısı var. Oyun konsolunda hatalar ve uyarılar " +
            "solda işaretli, yığın satırları ise kendi hatalarının altında içeriden başlıyor.",
        },
      },
    ],
    fixed: [
      {
        ru: "Скины и плащи Aciron снова видны в игре. После переезда на новый сервер игра не находила адрес, откуда их брать.",
        en: "Aciron skins and capes show up in the game again. After the move to the new server, the game could not find where to load them from.",
        tr: "Aciron görünümleri ve pelerinleri oyunda yeniden görünüyor. Yeni sunucuya geçişten sonra oyun onları nereden alacağını bulamıyordu.",
      },
      {
        ru: "Плащи Minecraft, выбранные на сайте, теперь видны и в лаунчере. Раньше гардероб показывал старый плащ до недели.",
        en: "Minecraft capes picked on the website now show in the launcher too. Before, the wardrobe could show the old cape for up to a week.",
        tr: "Sitede seçilen Minecraft pelerinleri artık başlatıcıda da görünüyor. Eskiden gardırop eski pelerini bir haftaya kadar gösterebiliyordu.",
      },
      {
        ru: "Сообщения в чате больше не пропадают, если их отправить одновременно с другими событиями.",
        en: "Chat messages no longer go missing when they are sent at the same time as other updates.",
        tr: "Sohbet mesajları, başka güncellemelerle aynı anda gönderildiğinde artık kaybolmuyor.",
      },
      {
        ru: "Друг, у которого пропал интернет или закрылся лаунчер, больше не висит «в сети» часами. Через минуту-полторы он показывается не в сети.",
        en: "A friend who lost their connection or closed the launcher no longer stays “online” for hours. They show as offline within a minute or two.",
        tr: "İnternet bağlantısı kopan ya da başlatıcıyı kapatan arkadaş artık saatlerce «çevrimiçi» görünmüyor. Bir iki dakika içinde çevrimdışı görünüyor.",
      },
      {
        ru: "Статус «в игре» теперь видят друзья и на сайте Aciron ID.",
        en: "Your “in game” status is now visible to friends on the Aciron ID website too.",
        tr: "«Oyunda» durumun artık Aciron ID sitesindeki arkadaşlarına da görünüyor.",
      },
      {
        ru: "После смены аккаунта друзья и чат переключаются на новый аккаунт сразу, без перезапуска лаунчера.",
        en: "After switching accounts, friends and chat move to the new account right away, without restarting the launcher.",
        tr: "Hesap değiştirdikten sonra arkadaşlar ve sohbet, başlatıcıyı yeniden açmadan hemen yeni hesaba geçiyor.",
      },
      {
        ru: "Панели реакций и эмодзи больше не вылезают за край окна.",
        en: "The reaction and emoji panels no longer go past the edge of the window.",
        tr: "Tepki ve emoji panelleri artık pencerenin kenarından taşmıyor.",
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-09-24",
    added: [
      {
        ru: {
          title: "Новый вид",
          body:
            "Лаунчер теперь выглядит как сайт и кабинет Aciron ID. Те же значки и шрифт, списки строками вместо " +
            "карточек в рамках, настройки строками с переключателями. Выбранный раздел отмечает подложка, " +
            "которая переезжает от пункта к пункту.",
        },
        en: {
          title: "New look",
          body:
            "The launcher now looks like the website and the Aciron ID account page. Same icons and font, lists " +
            "as plain rows instead of framed cards, settings as rows with switches. A highlight slides to the " +
            "selected section.",
        },
        tr: {
          title: "Yeni görünüm",
          body:
            "Başlatıcı artık site ve Aciron ID hesap sayfası gibi görünüyor. Aynı simgeler ve yazı tipi, " +
            "çerçeveli kartlar yerine düz satırlar, anahtarlı satırlar halinde ayarlar. Seçili bölüme kayan bir " +
            "vurgu gidiyor.",
        },
      },
      {
        ru: {
          title: "Страница мода как на сайте",
          body:
            "У мода и сборки из каталога теперь одна длинная страница: обложка из скриншотов, вкладки " +
            "«Описание», «Галерея» и «Версии», справа лицензия, загрузчики и ссылки.",
        },
        en: {
          title: "Mod pages like on the web",
          body:
            "Mods and modpacks from the catalog now open as one long page: a cover from the screenshots, " +
            "Description, Gallery and Versions tabs, and the license, loaders and links on the right.",
        },
        tr: {
          title: "Web sitesi gibi mod sayfası",
          body:
            "Katalogdaki mod ve paketler artık tek uzun sayfada açılıyor: ekran görüntülerinden kapak, " +
            "Açıklama, Galeri ve Sürümler sekmeleri, sağda lisans, yükleyiciler ve bağlantılar.",
        },
      },
      {
        ru: {
          title: "Друзья",
          body:
            "Головы друзей круглые, статус показывает цветная обводка: зелёная, если друг в сети, серая, если нет. " +
            "На главной друзья стали строками, так в список влезает больше людей.",
        },
        en: {
          title: "Friends",
          body:
            "Friend heads are round now, and a coloured ring shows the status: green when online, grey when " +
            "offline. Friends on the home screen are plain rows, so more people fit.",
        },
        tr: {
          title: "Arkadaşlar",
          body:
            "Arkadaş kafaları artık yuvarlak, durumu renkli halka gösteriyor: çevrimiçiyse yeşil, değilse gri. " +
            "Ana ekranda arkadaşlar düz satır oldu, listeye daha çok kişi sığıyor.",
        },
      },
      {
        ru: {
          title: "Фон «Свечение»",
          body:
            "Новый фон по умолчанию: тёплый свет в углу, который медленно дышит. Кубики и остальные фоны " +
            "остались в настройках темы.",
        },
        en: {
          title: "«Glow» background",
          body:
            "The new default background is a warm light in the corner that slowly breathes. The cubes and the " +
            "other backgrounds are still in the theme settings.",
        },
        tr: {
          title: "«Işıltı» arka planı",
          body:
            "Yeni varsayılan arka plan: köşede yavaşça nefes alan sıcak bir ışık. Küpler ve diğer arka planlar " +
            "tema ayarlarında duruyor.",
        },
      },
    ],
    fixed: [
      {
        ru: "Уже скачанная версия запускается, даже если серверы Mojang недоступны. Раньше при каждом запуске лаунчер заново спрашивал Mojang о версии, и без связи игра не стартовала.",
        en: "A version you already downloaded now starts even when Mojang's servers are unreachable. Before, the launcher asked Mojang about the version on every launch, and without a connection the game would not start.",
        tr: "Önceden indirilmiş bir sürüm, Mojang sunucularına ulaşılamasa da artık açılıyor. Eskiden başlatıcı her açılışta sürümü Mojang'a yeniden soruyordu ve bağlantı yoksa oyun başlamıyordu.",
      },
    ],
  },
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
