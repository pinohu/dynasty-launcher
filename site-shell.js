(function () {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const toolPaths = new Set(["/admin", "/app"]);
  const skipShell = document.documentElement.hasAttribute("data-no-site-shell") || toolPaths.has(path);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/pricing", label: "Pricing" },
    { href: "/sign-up?offer=foundation-build", label: "Provision" },
    { href: "/deliverables", label: "Examples" },
    { href: "/app?returning=1", label: "Builder" },
    { href: "/maturity", label: "Limits" },
  ];

  const sitemapGroups = [
    {
      title: "Buy",
      links: [
        { href: "/pricing", label: "Compare pricing" },
        { href: "/sign-up?offer=foundation-build", label: "Provision a purchase" },
        { href: "/terms", label: "Terms" },
      ],
    },
    {
      title: "Verify",
      links: [
        { href: "/deliverables", label: "Deliverable examples" },
        { href: "/maturity", label: "What ships today" },
        { href: "/observability", label: "System status" },
      ],
    },
    {
      title: "Operate",
      links: [
        { href: "/app?returning=1", label: "Builder" },
        { href: "/business-factory", label: "Admin factory" },
        { href: "mailto:ikeohu@dynastyempire.com", label: "Contact" },
      ],
    },
  ];

  function isCurrent(href) {
    try {
      const url = new URL(href, window.location.origin);
      const normalized = url.pathname.replace(/\/+$/, "") || "/";
      return normalized === path;
    } catch {
      return false;
    }
  }

  function linkMarkup(link, extraClass) {
    const current = isCurrent(link.href) ? ' aria-current="page"' : "";
    const external = /^https?:\/\//.test(link.href) ? ' target="_blank" rel="noopener noreferrer"' : "";
    const cls = extraClass ? ` class="${extraClass}"` : "";
    return `<a href="${link.href}"${cls}${current}${external}>${link.label}</a>`;
  }

  function ensureMainTarget() {
    if (document.getElementById("main-content")) return;
    const main = document.querySelector("main");
    if (main && !main.id) main.id = "main-content";
    if (main && main.id !== "main-content") {
      const target = document.createElement("span");
      target.id = "main-content";
      target.tabIndex = -1;
      target.setAttribute("aria-hidden", "true");
      main.insertBefore(target, main.firstChild);
      return;
    }
    if (!main) {
      const first = document.body.firstElementChild;
      if (first && !first.id) first.id = "main-content";
    }
  }

  function renderHeader() {
    if (document.querySelector(".yd-site-header")) return;
    const header = document.createElement("header");
    header.className = "yd-site-header";
    header.setAttribute("role", "banner");
    header.innerHTML = `
      <div class="yd-shell-inner">
        <a class="yd-brand" href="/" aria-label="Your Deputy home">
          <span class="yd-brand-mark" aria-hidden="true">YD</span>
          <span>Your Deputy</span>
        </a>
        <nav class="yd-primary-nav" aria-label="Primary navigation">
          ${navLinks.map((link) => linkMarkup(link)).join("")}
        </nav>
        <div class="yd-shell-actions">
          <a class="yd-link-muted" href="/sign-in">Sign in</a>
          <a class="yd-cta" href="/sign-up?offer=foundation-build">Provision</a>
        </div>
        <button class="yd-menu-button" type="button" aria-label="Open menu" aria-controls="yd-mobile-menu" aria-expanded="false">Menu</button>
      </div>
      <div class="yd-mobile-panel" id="yd-mobile-menu" data-open="false">
        <nav class="yd-mobile-grid" aria-label="Mobile navigation">
          ${navLinks.map((link) => linkMarkup(link)).join("")}
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </div>
    `;
    document.body.insertBefore(header, document.body.firstChild);
    const button = header.querySelector(".yd-menu-button");
    const panel = header.querySelector(".yd-mobile-panel");
    button.addEventListener("click", () => {
      const open = panel.getAttribute("data-open") === "true";
      panel.setAttribute("data-open", String(!open));
      button.setAttribute("aria-expanded", String(!open));
      button.textContent = open ? "Menu" : "Close";
    });
  }

  function renderFooter() {
    if (document.querySelector(".yd-site-footer")) return;
    const footer = document.createElement("footer");
    footer.className = "yd-site-footer";
    footer.setAttribute("role", "contentinfo");
    footer.innerHTML = `
      <div class="yd-footer-inner">
        <div class="yd-footer-grid">
          <section class="yd-footer-col" aria-labelledby="yd-footer-brand">
            <div class="yd-footer-brand" id="yd-footer-brand">Your Deputy</div>
            <p class="yd-footer-copy">Paid deliverable system: customer credentials in, launched runtime and receipt out. Every page should say exactly what is delivered and what still depends on customer-owned accounts.</p>
          </section>
          ${sitemapGroups.map((group) => `
            <section class="yd-footer-col" aria-labelledby="yd-footer-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">
              <h2 id="yd-footer-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">${group.title}</h2>
              ${group.links.map((link) => linkMarkup(link)).join("")}
            </section>
          `).join("")}
        </div>
        <div class="yd-footer-bottom">
          <span>© 2026 PA Registered Office Services, LLC. All rights reserved.</span>
          <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/maturity">Maturity</a> · <a href="/observability">Observability</a></span>
        </div>
      </div>
    `;
    document.body.appendChild(footer);
  }

  function renderSiteMap() {
    const home = path === "/";
    if (!home || document.querySelector(".yd-site-map")) return;
    const target = document.querySelector("main") || document.body;
    const section = document.createElement("section");
    section.className = "yd-site-map";
    section.setAttribute("aria-labelledby", "yd-site-map-title");
    section.innerHTML = `
      <h2 id="yd-site-map-title">Need the proof before buying?</h2>
      <p>Open examples, check delivery limits, or provision a paid offer. These are the three paths most customers need.</p>
      <div class="yd-site-map-grid">
        ${sitemapGroups.map((group) => `
          <div class="yd-site-map-card">
            <h3>${group.title}</h3>
            ${group.links.map((link) => linkMarkup(link)).join("")}
          </div>
        `).join("")}
      </div>
    `;
    target.appendChild(section);
  }

  function init() {
    ensureMainTarget();
    if (!document.querySelector(".yd-skip")) {
      const skip = document.createElement("a");
      skip.className = "yd-skip";
      skip.href = "#main-content";
      skip.textContent = "Skip to content";
      document.body.insertBefore(skip, document.body.firstChild);
    }
    if (!skipShell) {
      document.body.classList.add("yd-has-shell");
      renderHeader();
      renderSiteMap();
      renderFooter();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
