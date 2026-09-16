

use serde_json::Value;

pub const BODY_LIMIT: usize = 256 * 1024;

pub fn body_overflows(body: &str) -> bool {
    body.len() > BODY_LIMIT
}

pub fn clamp_body(body: &str) -> String {
    if body.len() <= BODY_LIMIT {
        return body.to_string();
    }
    let mut end = BODY_LIMIT;
    while end > 0 && !body.is_char_boundary(end) {
        end -= 1;
    }
    body[..end].to_string()
}

pub fn str_list(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default()
}

pub fn sort_versions_desc(v: &mut [String]) {
    v.sort_by(|a, b| cmp_version(b, a));
}

fn cmp_version(a: &str, b: &str) -> std::cmp::Ordering {
    let mut ai = parts(a).into_iter();
    let mut bi = parts(b).into_iter();
    loop {
        match (ai.next(), bi.next()) {
            (None, None) => return a.cmp(b),

            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (Some(x), Some(y)) => {
                let ord = x.cmp(&y);
                if ord != std::cmp::Ordering::Equal {
                    return ord;
                }
            }
        }
    }
}

fn parts(v: &str) -> Vec<u32> {
    v.split(['.', '-', '_', ' '])
        .map(|p| p.parse::<u32>())
        .take_while(|p| p.is_ok())
        .map(|p| p.unwrap())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_versions_come_first() {
        let mut v: Vec<String> = ["1.8.9", "1.21.11", "1.9.4", "1.20.1", "1.8", "1.21.2"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        sort_versions_desc(&mut v);
        assert_eq!(v, ["1.21.11", "1.21.2", "1.20.1", "1.9.4", "1.8.9", "1.8"]);
    }

    #[test]
    fn snapshots_do_not_break_order() {
        let mut v: Vec<String> = ["23w31a", "1.20.1", "1.21"].iter().map(|s| s.to_string()).collect();
        sort_versions_desc(&mut v);

        assert_eq!(v[0], "1.21");
        assert_eq!(v[1], "1.20.1");
    }
}
