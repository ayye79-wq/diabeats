type Faq = { question: string; answer: string };
type SeoPage = {
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  featureHeading: string;
  features: { icon: string; title: string; body: string }[];
  steps: { title: string; body: string }[];
  faqs: Faq[];
};

export const seoPages: SeoPage[] = [
  {
    path: "/diabetic-restaurant-app",
    title: "Diabetic Restaurant & Smart-Dining App | DiabEats",
    description: "Explore restaurant meals with DiabEats. Search nearby restaurants, scan menus, compare nutrition signals, and make more informed dining choices.",
    eyebrow: "Smart dining with less guesswork",
    heading: "A diabetic restaurant app built for real dining decisions",
    intro: "DiabEats helps people managing diabetes, prediabetes, and low-carb goals explore restaurants and understand the meals in front of them. Search in plain English, review available nutrition signals, and compare choices before ordering.",
    featureHeading: "A clearer path from restaurant search to an informed order",
    features: [
      { icon: "⌕", title: "Smart restaurant search", body: "Search for nearby restaurants and meals using requests such as “low-carb dinner near me.”" },
      { icon: "▣", title: "Menu scanning", body: "Photograph a restaurant menu and review the items DiabEats can identify and analyze." },
      { icon: "↔", title: "Meal comparison", body: "Compare available carbohydrate, sugar, fiber, protein, and processing signals side by side." },
      { icon: "✦", title: "Practical questions", body: "Ask about ingredients, portions, substitutions, and dining tradeoffs using the AI assistant." },
    ],
    steps: [
      { title: "Find or scan", body: "Search for a restaurant or photograph the menu in front of you." },
      { title: "Review the signals", body: "See the available nutrition details and the reasons behind the guidance." },
      { title: "Choose with context", body: "Compare meals, consider substitutions, and save useful options for later." },
    ],
    faqs: [
      { question: "Can DiabEats tell me what to order at a restaurant?", answer: "DiabEats provides decision-support information about available meal and nutrition signals. It can help you compare choices, but it does not replace advice from your clinician or dietitian." },
      { question: "Does DiabEats work with every restaurant?", answer: "Coverage and available details vary. You can search supported restaurant information or scan a menu when structured meal data is not available." },
      { question: "Can I save restaurant meals?", answer: "Yes. You can keep useful meals and favorites close by for a future visit." },
    ],
  },
  {
    path: "/food-scanner-for-diabetics",
    title: "Food-Scanning App for People With Diabetes | DiabEats",
    description: "Scan packaged foods by barcode, label photo, product name, or supported QR code. DiabEats explains verified nutrition and ingredient signals without guessing.",
    eyebrow: "Scan food. Understand the result.",
    heading: "A food-scanning app for people managing diabetes",
    intro: "Use a barcode, product name, package-label photo, or supported QR code to start a BioTrace lookup. DiabEats explains the nutrition and ingredient signals it can verify—and clearly marks information it cannot confirm.",
    featureHeading: "More than a barcode result",
    features: [
      { icon: "▦", title: "Multiple scan methods", body: "Use a barcode, supported QR code, product-name search, or a clear photograph of the package label." },
      { icon: "◉", title: "Nutrition signals", body: "Review available carbohydrate, sugar, fiber, protein, sodium, and serving information." },
      { icon: "i", title: "Ingredient explanations", body: "Understand recognized ingredients and sweeteners in plain language, including supported non-English data." },
      { icon: "✓", title: "No invented certainty", body: "When a product or nutrient cannot be verified, DiabEats shows it as unknown instead of filling the gap with a guess." },
    ],
    steps: [
      { title: "Scan or search", body: "Point your camera at the code or label, or search using the product name." },
      { title: "Verify the match", body: "Confirm that the returned brand, product, and serving information match your package." },
      { title: "Review the reasoning", body: "See the available nutrition and ingredient signals behind the Blood Sugar Fit guidance." },
    ],
    faqs: [
      { question: "What can I scan with DiabEats?", answer: "DiabEats supports packaged-food barcodes, product-name lookup, label photos, and supported QR codes. Results depend on the quality and availability of source data." },
      { question: "Does DiabEats estimate missing nutrition values?", answer: "No. BioTrace preserves missing values as unknown rather than presenting an unverified estimate as fact." },
      { question: "Is the food score medical advice?", answer: "No. The result is transparent decision support based on available product information. Individual responses vary, so use your care plan and professional guidance." },
    ],
  },
  {
    path: "/prediabetes-meal-planning-app",
    title: "Prediabetes Meal Planning & Food Guidance App | DiabEats",
    description: "Support everyday prediabetes food planning with carb targets, meal comparisons, saved choices, and meal logging in DiabEats.",
    eyebrow: "Plan choices around your goals",
    heading: "Prediabetes meal planning starts with clearer food choices",
    intro: "DiabEats supports day-to-day food planning with carbohydrate targets, meal comparisons, saved choices, and meal logging. It does not automatically prescribe a clinical meal plan; it gives you practical tools to organize and review your own choices.",
    featureHeading: "Tools for building a more intentional routine",
    features: [
      { icon: "◎", title: "Set a daily carb target", body: "Choose a carbohydrate target and dietary goal so guidance reflects the priorities you set." },
      { icon: "↔", title: "Compare options", body: "Put meals side by side and explore how portions or substitutions change the tradeoffs." },
      { icon: "♡", title: "Save useful choices", body: "Keep restaurant meals and packaged foods you may want to use again." },
      { icon: "≡", title: "Log meals and context", body: "Record what you ate and add an optional blood sugar note to create useful personal context over time." },
    ],
    steps: [
      { title: "Choose your target", body: "Set the daily carbohydrate target and food goal that matter to you." },
      { title: "Build from informed choices", body: "Scan, compare, and save foods or meals that fit your intended routine." },
      { title: "Record and review", body: "Log meals with optional notes so you can discuss patterns with your care team." },
    ],
    faqs: [
      { question: "Does DiabEats create a weekly meal plan automatically?", answer: "Not currently. DiabEats helps you organize decisions with targets, comparisons, saved foods, and meal logging; it does not prescribe an automatic weekly plan." },
      { question: "Can I use DiabEats if I have prediabetes?", answer: "Yes. The app is designed for people managing diabetes, prediabetes, and low-carb goals." },
      { question: "Can the app replace a dietitian?", answer: "No. DiabEats is a decision-support tool. A qualified clinician or dietitian can account for your complete health history and treatment plan." },
    ],
  },
  {
    path: "/sugar-free-restaurant-options",
    title: "Find Low-Sugar Restaurant Options | DiabEats",
    description: "Use DiabEats to scan restaurant menus, review available sugar and carbohydrate information, compare meals, and explore lower-sugar substitutions.",
    eyebrow: "Lower-sugar dining, with context",
    heading: "Find low-sugar and sugar-free restaurant options with more confidence",
    intro: "Restaurant labels such as “sugar-free” do not always tell the whole nutrition story. DiabEats helps you inspect available sugar, total carbohydrate, fiber, protein, portion, and ingredient signals so you can compare options in context.",
    featureHeading: "Look beyond a single sugar number",
    features: [
      { icon: "▣", title: "Scan the menu", body: "Photograph a menu to identify meals and review the information DiabEats can support." },
      { icon: "◇", title: "Review sugar and carbs", body: "Consider available sugar alongside total carbohydrates, fiber, protein, and serving context." },
      { icon: "↔", title: "Compare meals", body: "Place choices side by side rather than relying on a “healthy” or “sugar-free” label alone." },
      { icon: "✦", title: "Explore substitutions", body: "Ask about practical changes such as sauces on the side, unsweetened drinks, or alternative side dishes." },
    ],
    steps: [
      { title: "Search or photograph", body: "Find a restaurant in DiabEats or scan the available menu." },
      { title: "Check the full context", body: "Review the available sugar, carbohydrate, fiber, protein, and portion information." },
      { title: "Compare and ask", body: "Compare likely choices and ask about substitutions before you order." },
    ],
    faqs: [
      { question: "Does sugar-free mean carbohydrate-free?", answer: "No. A sugar-free item can still contain carbohydrates from starches or other ingredients. Review the complete available nutrition information when possible." },
      { question: "Can DiabEats guarantee that a restaurant meal is sugar-free?", answer: "No. Recipes, preparation, portions, and restaurant data can change. Confirm allergy or ingredient requirements directly with the restaurant." },
      { question: "What if the restaurant does not publish nutrition information?", answer: "You can scan the menu and review the information DiabEats can identify, but unavailable facts should remain unknown and should not be treated as verified." },
    ],
  },
];

const escapeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

export function renderSeoPage(page: SeoPage): string {
  const canonical = `https://diabeatsapp.com${page.path}`;
  const appUrl = "https://apps.apple.com/app/id6760898764";
  const related = seoPages.filter((item) => item.path !== page.path);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "DiabEats: Smart Dining",
        applicationCategory: "HealthApplication",
        operatingSystem: "iOS",
        url: canonical,
        description: page.description,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
      {
        "@type": "FAQPage",
        mainEntity: page.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://diabeatsapp.com/" },
          { "@type": "ListItem", position: 2, name: page.heading, item: canonical },
        ],
      },
    ],
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${page.title}</title>
  <meta name="description" content="${page.description}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DiabEats">
  <meta property="og:url" content="${canonical}">
  <meta property="og:title" content="${page.title}">
  <meta property="og:description" content="${page.description}">
  <meta property="og:image" content="https://diabeatsapp.com/assets/images/icon.png">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${page.title}">
  <meta name="twitter:description" content="${page.description}">
  <meta name="apple-itunes-app" content="app-id=6760898764">
  <script type="application/ld+json">${escapeJson(structuredData)}</script>
  <style>
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17211b;background:#fbfdfb;line-height:1.65}a{color:inherit}.wrap{width:min(1080px,calc(100% - 40px));margin:auto}nav{position:sticky;top:0;z-index:5;background:rgba(251,253,251,.94);backdrop-filter:blur(12px);border-bottom:1px solid #dce8df}.nav-inner{height:68px;display:flex;align-items:center;justify-content:space-between}.brand{display:flex;gap:10px;align-items:center;text-decoration:none;font-weight:800;font-size:19px}.brand img{width:34px;height:34px;border-radius:9px}.button{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:#166534;color:#fff;padding:12px 20px;border-radius:10px;font-weight:750;box-shadow:0 8px 22px rgba(22,101,52,.16)}.button.secondary{background:#fff;color:#166534;border:1px solid #b7d9c1;box-shadow:none}.hero{padding:88px 0 72px;background:radial-gradient(circle at 80% 10%,#dcfce7 0,transparent 34%),linear-gradient(180deg,#f7fcf8,#fff)}.hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:70px;align-items:center}.eyebrow{font-size:13px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;color:#166534}.hero h1{font-size:clamp(40px,6vw,67px);line-height:1.04;letter-spacing:-.045em;margin:16px 0 24px}.hero p{font-size:19px;color:#4b5e50;max-width:700px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}.demo-card{background:#fff;border:1px solid #cfe1d3;border-radius:26px;padding:24px;box-shadow:0 26px 70px rgba(24,70,38,.13)}.demo-top{display:flex;align-items:center;gap:13px;margin-bottom:22px}.demo-icon{width:46px;height:46px;border-radius:14px;background:#dcfce7;display:grid;place-items:center;color:#166534;font-size:22px}.signal{padding:15px 0;border-top:1px solid #e3ece5}.signal b{display:block}.signal span{color:#617065;font-size:14px}.notice{margin-top:18px;padding:13px 15px;border-radius:12px;background:#f0fdf4;color:#245b33;font-size:13px}section{padding:78px 0}.section-head{max-width:720px;margin-bottom:38px}.section-head h2{font-size:clamp(30px,4vw,45px);line-height:1.12;letter-spacing:-.03em;margin:10px 0}.section-head p{color:#596b5e;font-size:17px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}.card{background:#fff;border:1px solid #dce8df;border-radius:18px;padding:27px}.card-icon{width:42px;height:42px;border-radius:12px;background:#e9f9ee;color:#166534;display:grid;place-items:center;font-weight:800;font-size:20px}.card h3{margin:18px 0 7px;font-size:20px}.card p{margin:0;color:#5c6d61}.steps{background:#123d22;color:#fff}.steps .eyebrow{color:#86efac}.steps-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.step{border:1px solid rgba(255,255,255,.18);border-radius:18px;padding:25px;background:rgba(255,255,255,.055)}.step-number{font-size:13px;font-weight:900;color:#86efac}.step h3{margin:12px 0 7px}.step p{margin:0;color:#d4e8d9}.faq-list{display:grid;gap:12px}.faq-list details{background:#fff;border:1px solid #dce8df;border-radius:14px;padding:18px 20px}.faq-list summary{cursor:pointer;font-weight:750}.faq-list p{color:#56685b;margin:12px 0 2px}.related{background:#f0f8f2}.related-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.related a{background:#fff;border:1px solid #d7e7dc;border-radius:14px;padding:20px;text-decoration:none;font-weight:750}.related a span{display:block;color:#166534;font-size:13px;margin-top:8px}.cta{text-align:center}.cta h2{font-size:clamp(32px,5vw,52px);line-height:1.1;margin:0 auto 17px;max-width:760px}.cta p{color:#5b6c60;margin-bottom:28px}.disclaimer{font-size:13px;color:#68766c;max-width:760px;margin:24px auto 0}footer{padding:35px 0;border-top:1px solid #dce8df;color:#607064;font-size:14px}.footer-inner{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}.footer-links{display:flex;gap:15px;flex-wrap:wrap}@media(max-width:760px){.hero{padding:62px 0 52px}.hero-grid{grid-template-columns:1fr;gap:36px}.grid,.steps-grid,.related-grid{grid-template-columns:1fr}section{padding:58px 0}.nav-inner .button{padding:9px 12px;font-size:13px}}
  </style>
</head>
<body>
  <nav><div class="wrap nav-inner"><a class="brand" href="/"><img src="/assets/images/icon.png" alt="DiabEats logo">DiabEats</a><a class="button" href="${appUrl}">Get the app</a></div></nav>
  <main>
    <header class="hero"><div class="wrap hero-grid"><div><div class="eyebrow">${page.eyebrow}</div><h1>${page.heading}</h1><p>${page.intro}</p><div class="actions"><a class="button" href="${appUrl}">Download on the App Store</a><a class="button secondary" href="#how-it-works">See how it works</a></div></div><div class="demo-card" aria-label="Example DiabEats guidance"><div class="demo-top"><div class="demo-icon">◉</div><div><strong>Understand the choice</strong><br><span>Available signals, explained clearly</span></div></div><div class="signal"><b>Nutrition context</b><span>Carbohydrate, sugar, fiber, protein, and serving details when available</span></div><div class="signal"><b>Ingredient context</b><span>Plain-language explanations backed by available source data</span></div><div class="signal"><b>Transparent uncertainty</b><span>Unknown information stays unknown—never invented</span></div><div class="notice">DiabEats supports food decisions. It does not diagnose, treat, or replace individualized medical advice.</div></div></div></header>
    <section><div class="wrap"><div class="section-head"><div class="eyebrow">Inside DiabEats</div><h2>${page.featureHeading}</h2><p>Designed to make the information behind a food decision easier to inspect—not to hide it behind a single unexplained score.</p></div><div class="grid">${page.features.map((f) => `<article class="card"><div class="card-icon">${f.icon}</div><h3>${f.title}</h3><p>${f.body}</p></article>`).join("")}</div></div></section>
    <section class="steps" id="how-it-works"><div class="wrap"><div class="section-head"><div class="eyebrow">How it works</div><h2>Three steps to a clearer decision</h2></div><div class="steps-grid">${page.steps.map((s, i) => `<article class="step"><div class="step-number">STEP ${i + 1}</div><h3>${s.title}</h3><p>${s.body}</p></article>`).join("")}</div></div></section>
    <section><div class="wrap"><div class="section-head"><div class="eyebrow">Questions</div><h2>What to know before you use it</h2></div><div class="faq-list">${page.faqs.map((faq) => `<details><summary>${faq.question}</summary><p>${faq.answer}</p></details>`).join("")}</div></div></section>
    <section class="related"><div class="wrap"><div class="section-head"><div class="eyebrow">Explore more</div><h2>Other ways DiabEats can help</h2></div><div class="related-grid">${related.map((item) => `<a href="${item.path}">${item.heading}<span>Explore this guide →</span></a>`).join("")}</div></div></section>
    <section class="cta"><div class="wrap"><h2>Make the next food decision with more context</h2><p>Scan, compare, save, and learn with DiabEats.</p><a class="button" href="${appUrl}">Download DiabEats</a><p class="disclaimer">DiabEats is a decision-support tool, not a medical service. Nutrition and restaurant information can be incomplete or change over time. Verify important dietary requirements with the manufacturer or restaurant and follow guidance from your healthcare professional.</p></div></section>
  </main>
  <footer><div class="wrap footer-inner"><span>© 2026 DiabEats — Smarter dining for a healthier life.</span><span class="footer-links"><a href="/">Home</a><a href="/privacy">Privacy</a><a href="mailto:support@diabeatsapp.com">Support</a></span></div></footer>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-7708VKPQSN"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-7708VKPQSN');</script>
</body>
</html>`;
}
