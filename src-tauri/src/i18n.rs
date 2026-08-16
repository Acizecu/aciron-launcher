

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

pub fn pick(ru: &'static str, en: &'static str, tr: &'static str) -> &'static str {
    match lang() {
        Lang::Ru => ru,
        Lang::En => en,
        Lang::Tr => tr,
    }
}

pub fn code() -> &'static str {
    pick("ru", "en", "tr")
}
