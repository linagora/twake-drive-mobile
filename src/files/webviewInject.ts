/** Injected JavaScript that hides the cozy-bar (the web app's duplicate top bar)
 *  inside editor WebViews. Apply to both `injectedJavaScriptBeforeContentLoaded`
 *  and `injectedJavaScript` so it takes effect regardless of SPA render timing. */
export const HIDE_COZY_BAR =
  `(function(){try{var s=document.createElement('style');s.setAttribute('data-twd','hide-bar');` +
  `s.innerHTML='[role="banner"],#coz-bar,.coz-bar,.coz-bar-container,.coz-bar-wrapper{display:none!important;}';` +
  `document.head.appendChild(s);}catch(e){}})();true;`
