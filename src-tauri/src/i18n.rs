

use crate::settings;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    Ru,
    En,
    Tr,
}

pub fn lang() -> Lang {
    match settings::load_settings().language.as_str() {
        "en" => Lang::En,
        "tr" => Lang::Tr,
        _ => Lang::Ru,
    }
}

const TABLE: &[(&str, &str, &str)] = &[
    ("CurseForge modpack", "Модпак CurseForge", "CurseForge mod paketi"),
    ("FTB modpack", "Модпак FTB", "FTB mod paketi"),
    ("Modpack", "Модпак", "Mod paketi"),
    ("Get the launcher", "Скачать лаунчер", "Başlatıcıyı indir"),
    ("In the launcher", "В лаунчере", "Başlatıcıda"),
    ("Idle", "Отдыхает", "Boşta"),
    ("Playing Minecraft {v}", "Играет на {v}", "{v} oynuyor"),
    ("Playing {v}", "Играет в {v}", "{v} oynuyor"),
    ("Minecraft instance", "Сборка Minecraft", "Minecraft derlemesi"),
    ("Aciron — test server", "Aciron — тестовый сервер", "Aciron — test sunucusu"),
    ("Sign in with Microsoft", "Вход через Microsoft", "Microsoft ile giriş"),
    ("Sign-in failed. You can close this tab and go back to the launcher.", "Вход не удался. Можно закрыть вкладку и вернуться в лаунчер.", "Giriş yapılamadı. Bu sekmeyi kapatıp başlatıcıya dönebilirsiniz."),
    ("All set! Head back to Aciron Launcher — this tab can be closed.", "Готово! Вернитесь в Aciron Launcher — вкладку можно закрыть.", "Hazır! Aciron Launcher'a dönebilirsiniz — bu sekmeyi kapatabilirsiniz."),
    ("Exported from Aciron Launcher", "Экспортировано из Aciron Launcher", "Aciron Launcher'dan dışa aktarıldı"),
    ("Imported instance", "Импортированная сборка", "İçe aktarılan derleme"),
    ("Open Aciron", "Открыть Aciron", "Aciron'u aç"),
    ("Quit", "Выход", "Çıkış"),
];

pub fn t(en: &'static str) -> &'static str {
    let l = lang();
    if l == Lang::En {
        return en;
    }
    match TABLE.iter().find(|(key, _, _)| *key == en) {
        Some((_, ru, tr)) => {
            if l == Lang::Ru {
                ru
            } else {
                tr
            }
        }
        None => en,
    }
}

pub fn code() -> &'static str {
    match lang() {
        Lang::Ru => "ru",
        Lang::En => "en",
        Lang::Tr => "tr",
    }
}
