

use std::error::Error;
use std::time::Duration;

fn host_of(e: &reqwest::Error) -> String {
    e.url()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .unwrap_or_else(|| "unknown host".to_string())
}

fn causes(e: &reqwest::Error) -> String {
    let mut out = String::new();
    let mut src: Option<&dyn Error> = e.source();
    while let Some(s) = src {
        if !out.is_empty() {
            out.push_str(": ");
        }
        out.push_str(&s.to_string());
        src = s.source();
    }
    out
}

pub fn net_error(e: &reqwest::Error) -> String {
    let host = host_of(e);
    let chain = causes(e).to_lowercase();

    if e.is_timeout() {
        return format!("Server did not respond in time: {host}");
    }
    if e.is_connect() {

        if chain.contains("dns") || chain.contains("lookup") || chain.contains("resolve") {
            return format!("Couldn't find the server address, check your internet or DNS: {host}");
        }
        return format!("Couldn't connect to the server: {host}");
    }
    if e.is_body() || e.is_decode() {
        return format!("The server sent a response that could not be read: {host}");
    }
    if chain.is_empty() {
        format!("Request failed: {host}")
    } else {
        format!("Request failed: {host}: {}", causes(e))
    }
}

pub async fn send(req: reqwest::RequestBuilder) -> Result<reqwest::Response, String> {
    let again = req.try_clone();
    match req.send().await {
        Ok(r) => Ok(r),
        Err(e) if e.is_timeout() || e.is_connect() => match again {
            Some(r) => {
                tokio::time::sleep(Duration::from_millis(400)).await;
                r.send().await.map_err(|e| net_error(&e))
            }
            None => Err(net_error(&e)),
        },
        Err(e) => Err(net_error(&e)),
    }
}
