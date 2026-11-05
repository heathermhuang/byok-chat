(() => {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  const paths = new Set(['/', '/privacy', '/terms', '/cookies']);
  let allowed = true, configured = false, id = '', last = '';
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent) return;
    const data = event.data;
    if (data?.type === 'byok.analytics.state') { allowed = data.allowed === true; if (id) window['ga-disable-' + id] = !allowed; return; }
    if (!allowed || data?.type !== 'byok.analytics.page' || !/^G-[A-Z0-9]+$/i.test(data.id || '')) return;
    let url; try { url = new URL(data.page); } catch { return; }
    if (url.origin !== location.origin || url.search || url.hash || !paths.has(url.pathname) || last === url.href) return;
    id = data.id;
    const params = {page_location: url.origin + url.pathname, page_path: url.pathname, page_referrer: '', page_title: 'BYOK Chat', send_to: id};
    window.dataLayer ||= []; window.gtag ||= function () { window.dataLayer.push(arguments); };
    if (!configured) {
      configured = true;
      window.gtag('consent', 'default', {analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
      window.gtag('js', new Date());
      window.gtag('config', id, {...params, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_domain: location.hostname, cookie_expires: 31536000, cookie_update: false});
      const script = document.createElement('script'); script.async = true; script.referrerPolicy = 'no-referrer'; script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id; document.head.appendChild(script);
    }
    window.gtag('event', 'page_view', params); last = url.href;
  });
})();
