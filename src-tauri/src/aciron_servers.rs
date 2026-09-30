

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AcironServer {
    pub name: String,
    pub address: String,

    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub description: Option<String>,

    #[serde(default)]
    pub icon_url: Option<String>,

    #[serde(default)]
    pub banner_url: Option<String>,

    #[serde(default = "yes")]
    pub add_to_game: bool,
}

fn yes() -> bool {
    true
}

#[tauri::command]
pub async fn aciron_servers_list() -> Vec<AcironServer> {
    fetch().await
}

const CACHE_FILE: &str = "aciron_servers.json";
const OFFERED_FILE: &str = ".aciron-servers";

fn fallback() -> Vec<AcironServer> {
    vec![AcironServer {
        name: crate::i18n::t("Aciron — test server").to_string(),
        address: "mc.aciron.pro".into(),
        version: None,
        description: None,
        icon_url: None,
        banner_url: None,
        add_to_game: true,
    }]
}

pub async fn fetch() -> Vec<AcironServer> {
    let cache = crate::settings::launcher_root().join("cache").join(CACHE_FILE);
    let fresh = async {
        let resp = crate::aciron::get("/api/servers")
            .ok()?
            .timeout(Duration::from_secs(4))
            .send()
            .await
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        resp.json::<Vec<AcironServer>>().await.ok()
    }
    .await;
    match fresh {
        Some(list) => {
            let list: Vec<AcironServer> = list
                .into_iter()
                .filter(|s| sane(&s.address))
                .map(clean)
                .collect();
            if let Some(dir) = cache.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            let _ = std::fs::write(&cache, serde_json::to_vec(&list).unwrap_or_default());
            list
        }
        None => std::fs::read(&cache)
            .ok()
            .and_then(|b| serde_json::from_slice::<Vec<AcironServer>>(&b).ok())
            .unwrap_or_else(fallback),
    }
}

fn clean(mut s: AcironServer) -> AcironServer {
    if !s.icon_url.as_deref().is_some_and(|u| u.starts_with("https://") && u.len() < 512) {
        s.icon_url = None;
    }
    if !s.banner_url.as_deref().is_some_and(|u| u.starts_with("https://") && u.len() < 512) {
        s.banner_url = None;
    }
    if !s.version.as_deref().is_some_and(|v| {
        !v.is_empty() && v.len() <= 32 && v.chars().all(|c| c.is_ascii_alphanumeric() || ".-_ +".contains(c))
    }) {
        s.version = None;
    }
    s.name = s.name.chars().filter(|c| !c.is_control()).take(64).collect();
    s
}

fn sane(addr: &str) -> bool {
    let (host, port) = match addr.rsplit_once(':') {
        Some((h, p)) => (h, Some(p)),
        None => (addr, None),
    };
    !host.is_empty()
        && host.len() <= 253
        && !host.starts_with('-')
        && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        && port.is_none_or(|p| !p.is_empty() && p.len() <= 5 && p.chars().all(|c| c.is_ascii_digit()))
}

pub fn apply(game_dir: &Path, servers: &[AcironServer]) -> Result<(), String> {
    let path = game_dir.join("servers.dat");
    let offered_path = game_dir.join(OFFERED_FILE);
    let mut offered: HashSet<String> = std::fs::read_to_string(&offered_path)
        .unwrap_or_default()
        .lines()
        .map(|l| l.trim().to_lowercase())
        .filter(|l| !l.is_empty())
        .collect();

    let parsed = match std::fs::read(&path) {
        Ok(bytes) => parse(&bytes).ok_or("servers.dat is not valid NBT, leaving it as is")?,
        Err(_) => ServersFile::default(),
    };

    let add: Vec<&AcironServer> = servers
        .iter()
        .filter(|s| s.add_to_game && sane(&s.address))
        .filter(|s| {
            let key = s.address.to_lowercase();
            !parsed.ips.contains(&key) && !offered.contains(&key)
        })
        .collect();
    if add.is_empty() {
        return Ok(());
    }

    let data = parsed.write(&add);
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }

    let tmp = path.with_extension("dat.aciron-tmp");
    std::fs::write(&tmp, &data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;

    for s in &add {
        offered.insert(s.address.to_lowercase());
    }
    let mut list: Vec<String> = offered.into_iter().collect();
    list.sort();
    let _ = std::fs::write(&offered_path, list.join("\n") + "\n");
    Ok(())
}

#[derive(Default)]
struct ServersFile {
    root_name: Vec<u8>,

    other: Vec<u8>,

    entries: Vec<Vec<u8>>,
    ips: HashSet<String>,
}

impl ServersFile {
    fn write(&self, add: &[&AcironServer]) -> Vec<u8> {
        let mut out = vec![0x0A];
        out.extend_from_slice(&(self.root_name.len() as u16).to_be_bytes());
        out.extend_from_slice(&self.root_name);
        out.extend_from_slice(&self.other);

        out.push(0x09);
        put_str(&mut out, "servers");
        out.push(0x0A);
        out.extend_from_slice(&((self.entries.len() + add.len()) as i32).to_be_bytes());
        for e in &self.entries {
            out.extend_from_slice(e);
        }
        for s in add {
            out.push(0x08);
            put_str(&mut out, "name");
            put_str(&mut out, &s.name);
            out.push(0x08);
            put_str(&mut out, "ip");
            put_str(&mut out, &s.address);
            out.push(0x01);
            put_str(&mut out, "acceptTextures");
            out.push(1);
            out.push(0x00);
        }
        out.push(0x00);
        out
    }
}

fn put_str(out: &mut Vec<u8>, s: &str) {
    let b = s.as_bytes();
    let len = b.len().min(u16::MAX as usize);
    out.extend_from_slice(&(len as u16).to_be_bytes());
    out.extend_from_slice(&b[..len]);
}

struct Reader<'a> {
    d: &'a [u8],
    p: usize,
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let end = self.p.checked_add(n)?;
        let s = self.d.get(self.p..end)?;
        self.p = end;
        Some(s)
    }
    fn u8(&mut self) -> Option<u8> {
        Some(self.take(1)?[0])
    }
    fn u16(&mut self) -> Option<u16> {
        let b = self.take(2)?;
        Some(u16::from_be_bytes([b[0], b[1]]))
    }
    fn i32(&mut self) -> Option<i32> {
        let b = self.take(4)?;
        Some(i32::from_be_bytes([b[0], b[1], b[2], b[3]]))
    }
    fn string(&mut self) -> Option<&'a [u8]> {
        let n = self.u16()? as usize;
        self.take(n)
    }
    fn count(&mut self, size: usize) -> Option<()> {
        let n = self.i32()?;
        if n < 0 {
            return None;
        }
        self.take((n as usize).checked_mul(size)?)?;
        Some(())
    }

    fn skip(&mut self, tag: u8, depth: u32) -> Option<()> {
        if depth > 64 {
            return None;
        }
        match tag {
            1 => self.take(1).map(|_| ()),
            2 => self.take(2).map(|_| ()),
            3 | 5 => self.take(4).map(|_| ()),
            4 | 6 => self.take(8).map(|_| ()),
            7 => self.count(1),
            8 => self.string().map(|_| ()),
            9 => {
                let elem = self.u8()?;
                let n = self.i32()?;
                if n < 0 {
                    return None;
                }
                for _ in 0..n {
                    self.skip(elem, depth + 1)?;
                }
                Some(())
            }
            10 => loop {
                let t = self.u8()?;
                if t == 0 {
                    return Some(());
                }
                self.string()?;
                self.skip(t, depth + 1)?;
            },
            11 => self.count(4),
            12 => self.count(8),
            _ => None,
        }
    }
}

fn parse(data: &[u8]) -> Option<ServersFile> {
    let mut r = Reader { d: data, p: 0 };
    if r.u8()? != 0x0A {
        return None;
    }
    let mut f = ServersFile {
        root_name: r.string()?.to_vec(),
        ..Default::default()
    };
    loop {
        let start = r.p;
        let t = r.u8()?;
        if t == 0 {
            break;
        }
        let name = r.string()?;
        if t == 9 && name == b"servers" {
            let elem = r.u8()?;
            let n = r.i32()?;
            if n < 0 || (n > 0 && elem != 10) {
                return None;
            }
            for _ in 0..n {
                let s = r.p;

                loop {
                    let et = r.u8()?;
                    if et == 0 {
                        break;
                    }
                    let en = r.string()?;
                    if et == 8 && en == b"ip" {
                        let ip = r.string()?;
                        f.ips.insert(String::from_utf8_lossy(ip).trim().to_lowercase());
                    } else {
                        r.skip(et, 1)?;
                    }
                }
                f.entries.push(data[s..r.p].to_vec());
            }
        } else {
            r.skip(t, 0)?;
            f.other.extend_from_slice(&data[start..r.p]);
        }
    }
    Some(f)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn srv(name: &str, addr: &str) -> AcironServer {
        AcironServer {
            name: name.into(),
            address: addr.into(),
            version: None,
            description: None,
            icon_url: None,
            banner_url: None,
            add_to_game: true,
        }
    }

    fn game_file() -> Vec<u8> {
        let mut out = vec![0x0A, 0, 0];

        out.push(0x01);
        put_str(&mut out, "foo");
        out.push(7);
        out.push(0x09);
        put_str(&mut out, "servers");
        out.push(0x0A);
        out.extend_from_slice(&1i32.to_be_bytes());
        out.push(0x08);
        put_str(&mut out, "name");
        put_str(&mut out, "Мой сервер");
        out.push(0x08);
        put_str(&mut out, "ip");
        put_str(&mut out, "My.Server:25566");
        out.push(0x08);
        put_str(&mut out, "icon");
        put_str(&mut out, &"A".repeat(3000));
        out.push(0x01);
        put_str(&mut out, "hidden");
        out.push(0);
        out.push(0x00);
        out.push(0x00);
        out
    }

    fn tmp(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("aciron-servers-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn appends_and_keeps_players_servers_byte_for_byte() {
        let dir = tmp("keep");
        let original = game_file();
        std::fs::write(dir.join("servers.dat"), &original).unwrap();
        apply(&dir, &[srv("Aciron", "mc.aciron.pro"), srv("Dup", "my.server:25566")]).unwrap();

        let out = std::fs::read(dir.join("servers.dat")).unwrap();
        let f = parse(&out).expect("valid nbt");
        assert_eq!(f.entries.len(), 2, "player's server + one new, duplicate skipped");
        assert!(f.ips.contains("mc.aciron.pro"));

        let old = parse(&original).unwrap();
        assert_eq!(f.entries[0], old.entries[0]);
        assert_eq!(f.other, old.other, "other root tags survive");
    }

    #[test]
    fn does_not_bring_back_a_removed_server() {
        let dir = tmp("removed");
        apply(&dir, &[srv("Aciron", "mc.aciron.pro")]).unwrap();

        std::fs::write(dir.join("servers.dat"), game_file()).unwrap();
        apply(&dir, &[srv("Aciron", "mc.aciron.pro")]).unwrap();
        let f = parse(&std::fs::read(dir.join("servers.dat")).unwrap()).unwrap();
        assert!(!f.ips.contains("mc.aciron.pro"));
    }

    #[test]
    fn leaves_broken_file_alone() {
        let dir = tmp("broken");
        std::fs::write(dir.join("servers.dat"), b"\x0a\x00\x00\x09\x00").unwrap();
        assert!(apply(&dir, &[srv("Aciron", "mc.aciron.pro")]).is_err());
        assert_eq!(std::fs::read(dir.join("servers.dat")).unwrap(), b"\x0a\x00\x00\x09\x00");
    }

    #[test]
    fn creates_file_when_missing_and_rejects_bad_addresses() {
        let dir = tmp("new");
        apply(&dir, &[srv("Aciron", "mc.aciron.pro"), srv("Evil", "--quickPlay x")]).unwrap();
        let f = parse(&std::fs::read(dir.join("servers.dat")).unwrap()).unwrap();
        assert_eq!(f.entries.len(), 1);
    }
}
