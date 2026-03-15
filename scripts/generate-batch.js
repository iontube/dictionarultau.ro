import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Load .env for standalone usage
try {
  const envContent = fs.readFileSync(path.join(rootDir, '.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0 && !process.env[key.trim()]) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
} catch (e) {}

// API Keys
const GEMINI_KEYS = [
  'AIzaSyAbRzbs0WRJMb0gcojgyJlrjqOPr3o2Cmk',
  'AIzaSyDZ2TklBMM8TU3FA6aIS8vdUc-2iMyHWaM',
  'AIzaSyBdmChQ0ARDdDAqSMSlDIit_xz5ucrWjkY',
  'AIzaSyAE57AIwobFO4byKbeoa-tVDMV5lMgcAxQ',
  'AIzaSyBskPrKeQvxit_Rmm8PG_NO0ZhMQsrktTE',
  'AIzaSyAkUcQ3YiD9cFiwNh8pkmKVxVFxEKFJl2Q',
  'AIzaSyDnX940N-U-Sa0202-v3_TOjXf42XzoNxE',
  'AIzaSyAMl3ueRPwzT1CklxkylmTXzXkFd0A_MqI',
  'AIzaSyA82h-eIBvHWvaYLoP26zMWI_YqwT78OaI',
  'AIzaSyBRI7pd1H2EdCoBunJkteKaCDSH3vfqKUg',
  'AIzaSyA3IuLmRWyTtygsRJYyzHHvSiTPii-4Dbk',
  'AIzaSyB6RHadv3m1WWTFKb_rB9ev_r4r2fM9fNU',
  'AIzaSyCexyfNhzT2py3FLo3sXftqKh0KUdAT--A',
  'AIzaSyC_SN_RdQ2iXzgpqng5Byr-GU5KC5npiAE',
  'AIzaSyBOV9a_TmVAayjpWemkQNGtcEf_QuiXMG0',
  'AIzaSyCFOafntdykM82jJ8ILUqY2l97gdOmwiGg',
  'AIzaSyACxFhgs3tzeeI5cFzrlKmO2jW0l8poPN4',
  'AIzaSyBhZXBhPJCv9x8jKQljZCS4b5bwF3Ip3pk',
  'AIzaSyDF7_-_lXcAKF81SYpcD-NiA5At4Bi8tp8',
  'AIzaSyAwinD7oQiQnXeB2I5kyQsq_hEyJGhSrNg',
];

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

let currentKeyIndex = 0;

function getNextGeminiKey() {
  const key = GEMINI_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % GEMINI_KEYS.length;
  return key;
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/ă/g, 'a').replace(/â/g, 'a').replace(/î/g, 'i')
    .replace(/ș/g, 's').replace(/ț/g, 't')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeForHtml(str) {
  if (!str) return '';
  return str.replace(/"/g, '&quot;');
}

function stripStrong(str) {
  return str.replace(/<\/?strong>/g, '');
}

function stripFakeLinks(html, pagesDir) {
  return html.replace(/<a\s+href="\/([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, linkPath, text) => {
    const slug = linkPath.replace(/\/$/, '');
    if (fs.existsSync(path.join(pagesDir, `${slug}.astro`))) return match;
    if (fs.existsSync(path.join(pagesDir, slug))) return match;
    return text;
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Translate title to English using Gemini
async function translateToEnglish(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getNextGeminiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Translate the following Romanian text to English. Return ONLY the English translation, nothing else:\n\n${text}` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 200 }
        })
      });
      const data = await response.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text.trim();
      }
      console.error(`  Translation attempt ${attempt + 1} failed: no candidates`);
    } catch (error) {
      console.error(`  Translation attempt ${attempt + 1} error: ${error.message}`);
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
  return text;
}

// Generate image using Cloudflare Workers AI

// Strip brand names from image prompt to avoid Cloudflare AI content filter
function stripBrands(text) {
  return text
    .replace(/\b[A-Z][a-z]+[A-Z]\w*/g, '')  // camelCase brands: HyperX, PlayStation
    .replace(/\b[A-Z]{2,}\b/g, '')            // ALL CAPS: ASUS, RGB, LED
    .replace(/\s{2,}/g, ' ')                   // collapse double spaces
    .trim();
}

// Use Gemini to rephrase a title into a generic description without brand names
async function rephraseWithoutBrands(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getNextGeminiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Rephrase the following into a short, generic English description for an image prompt. Remove ALL brand names, trademarks, product names, and game names. Replace them with generic descriptions of what they are. Return ONLY the rephrased text, nothing else.\n\nExample: "Boggle classic word game" -> "classic letter dice word game on a table"\nExample: "Kindle Paperwhite review" -> "slim e-reader device with paper-like screen"\nExample: "Duolingo app for learning languages" -> "colorful language learning mobile app interface"\n\nText: "${text}"` }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 100 }
        })
      });
      const data = await response.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const result = data.candidates[0].content.parts[0].text.trim();
        console.log(`  Rephrased prompt (no brands): ${result}`);
        return result;
      }
    } catch (error) {
      console.error(`  Rephrase attempt ${attempt + 1} error: ${error.message}`);
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
  // Fallback to basic stripBrands
  return stripBrands(text);
}

async function generateSafePrompt(text, categorySlug) {
  const categoryFallbacks = {
    'carti-si-dictionare': 'a stack of colorful books on a wooden desk with warm ambient lighting, cozy reading nook with a cup of tea',
    'invatare-limbi-straine': 'language learning materials on a study desk, colorful notebooks and flashcards, warm ambient lighting',
    'electronice-educative': 'modern educational tablet and electronic devices on a clean desk, soft studio lighting',
    'jocuri-de-cuvinte': 'colorful board game pieces and letter tiles on a wooden table, warm cozy family atmosphere',
  };
  // Try Gemini to create a safe, abstract prompt
  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getNextGeminiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Create a short, safe English image prompt for a stock photo related to this topic: "${text}". The prompt must describe ONLY objects, scenery, and atmosphere. NEVER mention people, children, babies, faces, hands, or any human body parts. NEVER use brand names. Focus on products, objects, books, devices, furniture, or abstract scenes. Return ONLY the description, nothing else.\n\nExample: "baby stroller review" -> "modern stroller parked in a sunny garden with flowers"\nExample: "children board game" -> "colorful board game pieces and dice on a wooden table"` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 100 }
        })
      });
      const data = await response.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const result = data.candidates[0].content.parts[0].text.trim();
        console.log(`  Safe prompt generated: ${result}`);
        return result;
      }
    } catch (error) {
      console.error(`  Safe prompt attempt ${attempt + 1} error: ${error.message}`);
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
  }
  return categoryFallbacks[categorySlug] || 'beautiful arrangement of books and educational materials on a wooden desk, warm ambient lighting, cozy atmosphere';
}

async function generateImage(titleRo, slug, categorySlug) {
  const categoryPrompts = {
    'carti-si-dictionare': 'on a wooden desk with warm ambient lighting, cozy study room, books and reading atmosphere',
    'invatare-limbi-straine': 'on a study desk with notebooks and learning materials, warm ambient lighting, cozy atmosphere',
    'electronice-educative': 'on a clean modern desk, soft studio lighting, educational setting, bright and organized',
    'jocuri-de-cuvinte': 'on a wooden table with board games, warm cozy lighting, family game night atmosphere',
  };

  console.log(`  Generating image for: ${titleRo}`);

  const MAX_IMAGE_RETRIES = 4;
  let promptFlagged = false;

  for (let attempt = 1; attempt <= MAX_IMAGE_RETRIES; attempt++) {

    if (attempt > 1) {

      console.log(`  Image retry attempt ${attempt}/${MAX_IMAGE_RETRIES}...`);

      await new Promise(r => setTimeout(r, 3000 * attempt));

    }


  try {
    let prompt;

    if (attempt >= 3) {
      // Last resorts: use fully safe prompt with no reference to original subject
      const safeSubject = await generateSafePrompt(titleRo, categorySlug);
      prompt = `Realistic photograph of ${safeSubject}, no text, no writing, no words, no letters, no numbers. Photorealistic, high quality, professional photography.`;
    } else {
      const titleEn = await translateToEnglish(titleRo);
      console.log(`  Translated title: ${titleEn}`);

      const setting = categoryPrompts[categorySlug] || 'in a modern home setting, soft natural lighting, clean contemporary background';
      const subject = promptFlagged ? await rephraseWithoutBrands(titleEn) : titleEn;
      prompt = `Realistic photograph of ${subject} ${setting}, no text, no brand name, no writing, no words, no letters, no numbers. Photorealistic, high quality, professional product photography.`;
    }

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('steps', '20');
    formData.append('width', '1024');
    formData.append('height', '768');

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-2-dev`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  Image API error: ${response.status} - ${errorText.slice(0, 200)}`);
      if (errorText.includes('flagged')) promptFlagged = true;
      continue;
    }

    const data = await response.json();
    if (!data.result?.image) {
      console.error('  No image in response');
      continue;
    }

    const imageBuffer = Buffer.from(data.result.image, 'base64');

    const outputPath = path.join(rootDir, 'public', 'images', 'articles', `${slug}.webp`);
    await sharp(imageBuffer)
      .resize(800, 600, { fit: 'cover' })
      .webp({ quality: 82, effort: 6 })
      .toFile(outputPath);

    console.log(`  Image saved: ${outputPath}`);
    return `/images/articles/${slug}.webp`;
  } catch (error) {
    console.error(`  Image generation error: ${error.message}`);
    continue;
  }


  }

  console.error('  Image generation failed after all retries');

  return null;
}

// Generate article content using Gemini
async function generateArticleContent(keyword, category, completedArticles = []) {

  
  // Build interlink list from completed articles
  const currentSlug = keyword.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const interlinkCandidates = completedArticles
    .filter(a => a.keyword !== keyword)
    .map(a => {
      const aSlug = a.keyword.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return { title: a.keyword.charAt(0).toUpperCase() + a.keyword.slice(1), slug: aSlug, category: a.category, categorySlug: a.categorySlug };
    });
  // Prioritize same category, then others, max 15
  const sameCategory = interlinkCandidates.filter(a => a.categorySlug === completedArticles.find(c => c.keyword === keyword)?.categorySlug);
  const otherCategory = interlinkCandidates.filter(a => !sameCategory.includes(a));
  const interlinkList = [...sameCategory, ...otherCategory].slice(0, 15)
    .map(a => `- <a href="/${a.slug}/">${a.title}</a> (categorie: ${a.category})`)
    .join('\n');

const prompt = `Scrii articole pe un site romanesc despre resurse educationale - dictionare, aplicatii de invatare, cursuri, carti si instrumente educationale. Stilul e informativ dar directionat spre conversie - ajuti cititorul sa aleaga cea mai buna resursa. NU esti un AI.

Keyword: "${keyword}"
Categorie: "${category}"

GENEREAZA un articol complet in format JSON cu structura de mai jos. Articolul trebuie sa fie informativ, natural, scris de un om care chiar stie domeniul. Fara diacritice. Intre 1500-2500 de cuvinte.

=== TONUL SI STILUL ===
- Scrii ca un profesor sau mentor care recomanda resurse educationale - nu ca un vanzator
- Focusul e pe EFICIENTA INVATARII, nu pe cumparare - ajuti cititorul sa aleaga cea mai buna resursa pentru nevoile lui
- Evalueaza calitatea continutului, metodologia de predare, experienta utilizatorului
- Foloseste "resurse educationale" sau "instrumente" in loc de "produse"
- Foloseste "alegere" in loc de "cumparare"
- Ton: prieten care se pricepe la educatie si iti da sfaturi concrete
- Exemplu paragraf cu intrebare: "Merita un curs online de engleza? Da, platforme precum X ofera lectii interactive de la 49 lei/luna, cu certificat la final si acces nelimitat la materiale."

=== ANTI-AI FOOTPRINT (FOARTE IMPORTANT) ===
Articolul TREBUIE sa para scris de un om real, nu de AI. Reguli concrete:
- FARA tranzitii generice: NU folosi "Asadar", "In primul rand", "De asemenea", "Cu toate acestea", "Este important de mentionat", "Trebuie sa tinem cont", "Nu in ultimul rand"
- FARA structura predictibila: nu toate paragrafele sa aiba aceeasi lungime. Amesteca: un paragraf de 2 propozitii, urmat de unul de 4, apoi unul de 1 propozitie.
- IMPERFECTIUNI NATURALE: include formulari imperfecte dar naturale: "bon, stai", "cum sa zic", "pana la urma", "na, asta e", "ma rog", "zic si eu"
- Amesteca propozitii FOARTE scurte (3-5 cuvinte: "Merita. Punct." / "Nu-i rau." / "Depinde de buget.") cu propozitii lungi (18-22 cuvinte)
- Foloseste MULT limbaj conversational romanesc: "na", "uite", "stai putin", "pe bune", "sincer", "daca ma intrebi pe mine", "am sa fiu direct", "uite care-i treaba"
- INTERZIS TOTAL: "in era actuala", "descopera", "fara indoiala", "ghid complet", "in concluzie", "in acest articol", "hai sa exploram", "sa aprofundam", "merita mentionat", "este esential", "este crucial", "o alegere excelenta"
- INTERZIS: liste de 3 adjective consecutive, inceperea a doua propozitii la rand cu acelasi cuvant, folosirea aceluiasi pattern de inceput de paragraf
- Include anecdote personale CONCRETE: "am folosit aplicatia asta vreo 3 luni", "un prieten a terminat cursul si dupa 2 luni vorbea decent...", "am testat personal resursa asta"
- Include critici ONESTE: fiecare resursa sa aiba minim 1-2 minusuri reale, nu critici false gen "singurul minus e ca e prea bun"
- Recunoaste incertitudine: "n-am testat personal, dar din ce am auzit...", "pe asta nu pun mana in foc, dar..."
- Vorbeste ca pe un forum romanesc, nu ca o enciclopedie

=== PARAGRAFE CU INTREBARI ===
Integreaza natural paragrafe care incep cu o intrebare directa, urmata de raspunsul concret cu cifre si exemple:
- "Merita un curs online de engleza? Da, platforme precum X ofera lectii interactive de la 49 lei/luna, cu certificat la final si acces nelimitat la materiale."
- "Cat costa un dictionar bun? Depinde - versiunile digitale pornesc de la 30 lei, iar cele fizice de referinta ajung la 150-200 lei."
- Include 2-3 astfel de paragrafe natural in text, nu fortate

=== STRUCTURA JSON ===
Returneaza DOAR JSON valid, fara markdown, fara \`\`\`:
{
  "intro": "HTML cu 2-3 paragrafe <p>. Raspunsul direct la ce cauta userul. FARA introducere generica. Prima propozitie = recomandarea ta directa.",
  "items": [
    {
      "name": "Numele resursei educationale",
      "specs": {
        "format": "ex: aplicatie mobila / carte fizica / curs online / dictionar digital",
        "nivel": "ex: incepator-intermediar / A1-B2 / toate nivelurile",
        "limba": "ex: engleza-romana / franceza / multilingv (30+ limbi)",
        "pagini_durata": "ex: 450 pagini / 120 ore curs / acces nelimitat",
        "pret_acces": "ex: 89 lei carte / 49 lei/luna abonament / gratuit cu reclame"
      },
      "review": "HTML <p> cu recenzie detaliata - calitatea continutului, metodologie, experienta. Minim 80 cuvinte. Ton onest cu plusuri si minusuri.",
      "pros": ["avantaj 1", "avantaj 2", "avantaj 3"],
      "cons": ["dezavantaj real 1", "dezavantaj real 2"]
    }
  ],
  "comparison": {
    "columns": ["Model", "Format", "Nivel", "Limba", "Pret/Acces", "Potrivit pentru"],
    "rows": [
      {"model":"...", "format":"...", "nivel":"...", "limba":"...", "pret_acces":"...", "potrivitPentru":"..."}
    ]
  },
  "guide": {
    "title": "Titlu ghid alegere cu keyword integrat natural",
    "content": "HTML cu <p>, <h4>, <ul>/<li>. Criterii de alegere, sfaturi, greseli de evitat. Minim 250 cuvinte."
  },
  "faq": [
    {
      "question": "Intrebare EXACT cum ar tasta-o un roman in Google",
      "answer": "Prima propozitie = raspuns direct (featured snippet). Apoi 1-2 propozitii cu detalii si cifre. Total 40-70 cuvinte."
    }
  ]
}

=== CERINTE RESURSE ===
- 5-7 resurse educationale reale, cu detalii reale (nu inventate)
- Preturi in LEI, realiste pentru piata din Romania
- Fiecare resursa cu review onest (minim 80 cuvinte), 3 avantaje si 2 dezavantaje REALE
- Specs complete: format, nivel, limba, pagini_durata, pret_acces
- Include mix de resurse: gratuite si platite, digitale si fizice, pentru diferite niveluri

=== CERINTE FAQ ===
- 5 intrebari formatate EXACT cum le tasteaza oamenii in Google Romania
- Formulari naturale: "cat costa...", "care e diferenta intre...", "merita sa...", "ce ... e mai bun", "cum sa..."
- Raspuns = 40-70 cuvinte, auto-suficient, cu cifre concrete
- Acoperiti: pret, comparatie, eficienta, alegere, probleme frecvente

=== REGULI ===
- Scrie FARA diacritice (fara ă, î, ș, ț, â - foloseste a, i, s, t)
- Preturile in LEI, realiste
- Keyword "${keyword}" in <strong> de 4-6 ori, natural in text
- NICIODATA <strong> in titluri, intrebari FAQ, sau heading-uri
- Maxim 3-4 propozitii per paragraf
- Comparison: include TOATE resursele din items

${interlinkList.length > 0 ? `
=== INTERLINK-URI INTERNE (SEO) ===
Mentioneaza NATURAL in text 2-4 articole de pe site, cu link-uri <a href="/{slug}/">{titlu}</a>.
Integreaza in propozitii, NU ca lista separata. Max 4 link-uri. Doar unde are sens contextual.
NU forta link-uri daca nu au legatura cu subiectul. Mai bine 0 link-uri decat link-uri fortate.

Articole disponibile:
${interlinkList}` : ''}`;

  let retries = 5;
  while (retries > 0) {
    const apiKey = getNextGeminiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 40000,
            responseMimeType: "application/json"
          }
        })
      });

      const data = await response.json();

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        let text = data.candidates[0].content.parts[0].text.trim();

        try {
          const parsed = JSON.parse(text);
          if (parsed.intro && parsed.items && parsed.faq) {
            return parsed;
          }
          console.error('  Invalid JSON structure, retrying...');
          retries--;
          await sleep(2000);
        } catch (parseError) {
          console.error(`  JSON parse error: ${parseError.message.substring(0, 50)}, retrying...`);
          retries--;
          await sleep(2000);
        }
      } else {
        const blockReason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'unknown';
        console.error(`  No content in response (reason: ${blockReason})`);
        if (data.error) console.error(`  API error detail: ${JSON.stringify(data.error)}`);
        retries--;
        await sleep(2000);
      }
    } catch (error) {
      console.error(`  API error: ${error.message}`);
      retries--;
      await sleep(2000);
    }
  }

  throw new Error('Failed to generate content after 5 retries');
}

// Convert markdown to HTML
function markdownToHtml(text) {
  if (!text) return text;
  // Convert **bold** to <strong>
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Remove markdown list markers (* or - at start of line)
  text = text.replace(/^\*\s+/gm, '');
  text = text.replace(/^-\s+/gm, '');
  text = text.replace(/\n\*\s+/g, '\n');
  text = text.replace(/\n-\s+/g, '\n');
  return text;
}

// Get author for category
function getAuthorForCategory(category) {
  const authors = {
    'Carti si Dictionare': {
      name: 'Maria Popescu',
      role: 'Specialist in Lingvistica',
      bio: 'Cu peste 10 ani de experienta in domeniul lingvisticii si al editarii de dictionare, Maria te ajuta sa alegi cele mai bune resurse pentru invatare.'
    },
    'Invatare Limbi Straine': {
      name: 'Alexandru Ionescu',
      role: 'Profesor de Limbi Straine',
      bio: 'Alex preda engleza si franceza de peste 8 ani si a ajutat mii de studenti sa-si atinga obiectivele lingvistice prin metode moderne de invatare.'
    },
    'Electronice Educative': {
      name: 'Cristian Mihai',
      role: 'Expert EdTech',
      bio: 'Pasionat de tehnologie si educatie, Cristian testeaza si recenzeaza dispozitive electronice care faciliteaza invatarea si lectura digitala.'
    },
    'Jocuri de Cuvinte': {
      name: 'Elena Dumitrescu',
      role: 'Specialist in Jocuri Educative',
      bio: 'Elena crede ca invatarea trebuie sa fie distractiva. Te ajuta sa descoperi cele mai captivante jocuri care iti dezvolta vocabularul.'
    }
  };
  return authors[category] || authors['Carti si Dictionare'];
}

// Clean HTML helper - sanitize content from AI
function cleanHtml(html) {
  if (!html) return '';
  let cleaned = markdownToHtml(html);
  // Remove dangerous tags but keep formatting
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/on\w+="[^"]*"/gi, '');
  cleaned = cleaned.replace(/on\w+='[^']*'/gi, '');
  return cleaned;
}

// Create article page
function createArticlePage(keyword, content, imagePath, category, categorySlug, author) {
  const slug = slugify(keyword);
  const title = capitalizeFirst(keyword);
  const date = new Date().toISOString();

  // Clean all content
  content.intro = cleanHtml(content.intro);
  content.items = (content.items || []).map(item => ({
    ...item,
    name: cleanHtml(item.name),
    review: cleanHtml(item.review),
    pros: (item.pros || []).map(p => cleanHtml(p)),
    cons: (item.cons || []).map(c => cleanHtml(c)),
    specs: item.specs || {}
  }));
  if (content.comparison) {
    content.comparison.columns = (content.comparison.columns || []).map(c => cleanHtml(c));
    content.comparison.rows = (content.comparison.rows || []).map(row => {
      const cleaned = {};
      for (const [k, v] of Object.entries(row)) cleaned[k] = cleanHtml(v);
      return cleaned;
    });
  }
  if (content.guide) {
    content.guide.title = cleanHtml(content.guide.title);
    content.guide.content = cleanHtml(content.guide.content);
  }
  content.faq = (content.faq || []).map(item => ({
    question: cleanHtml(item.question),
    answer: cleanHtml(item.answer)
  }));

  // Extract excerpt from first <p> in intro
  const firstPMatch = content.intro.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const excerpt = firstPMatch
    ? firstPMatch[1].replace(/<[^>]*>/g, '').trim()
    : content.intro.replace(/<[^>]*>/g, '').substring(0, 200).trim();

  // --- Build Intro HTML ---
  let introHtml = content.intro;
  // Ensure intro is wrapped in <p> tags
  if (!introHtml.includes('<p>') && !introHtml.includes('<p ')) {
    introHtml = introHtml.split(/\n\n+/).map(p => p.trim()).filter(p => p).map(p => `<p>${p}</p>`).join('\n        ');
  }

  // --- Build Items HTML ---
  const itemsHtml = content.items.map((item, index) => {
    const specsGrid = Object.entries(item.specs || {}).map(([key, val]) => {
      const label = key.replace(/_/g, ' ');
      return `<div class="product-review__spec"><strong>${stripStrong(label)}</strong>${stripStrong(val)}</div>`;
    }).join('\n              ');

    const prosHtml = (item.pros || []).map(p => `<li>${p}</li>`).join('\n                  ');
    const consHtml = (item.cons || []).map(c => `<li>${c}</li>`).join('\n                  ');

    let reviewContent = item.review;
    // Ensure review is wrapped in <p> tags
    if (!reviewContent.includes('<p>') && !reviewContent.includes('<p ')) {
      reviewContent = reviewContent.split(/\n\n+/).map(p => p.trim()).filter(p => p).map(p => `<p>${p}</p>`).join('\n            ');
    }

    const itemId = slugify(stripStrong(item.name));

    return `
      <article class="product-review" id="item-${itemId}">
        <div class="product-review__header">
          <span class="section-tag">Resursa #${index + 1}</span>
          <h3>${stripStrong(item.name)}</h3>
          <div class="product-review__specs-grid">
            ${specsGrid}
          </div>
        </div>
        <div class="product-review__content">
          ${reviewContent}
          <div class="product-review__lists">
            <div>
              <h4>Avantaje</h4>
              <ul class="product-review__pros">
                ${prosHtml}
              </ul>
            </div>
            <div>
              <h4>Dezavantaje</h4>
              <ul class="product-review__cons">
                ${consHtml}
              </ul>
            </div>
          </div>
        </div>
      </article>`;
  }).join('\n');

  // --- Build Comparison HTML ---
  let comparisonHtml = '';
  if (content.comparison && content.comparison.rows && content.comparison.rows.length > 0) {
    const columns = content.comparison.columns || ['Model', 'Format', 'Nivel', 'Limba', 'Pret/Acces', 'Potrivit pentru'];
    const colKeys = ['model', 'format', 'nivel', 'limba', 'pret_acces', 'potrivitPentru'];

    const thHtml = columns.map(c => `<th>${stripStrong(c)}</th>`).join('');
    const rowsHtml = content.comparison.rows.map(row => {
      const cells = colKeys.map(k => `<td>${stripStrong(row[k] || '')}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('\n            ');

    comparisonHtml = `
      <section id="comparatie">
        <h2>Comparatie resurse</h2>
        <div class="comparison-outer" id="comparison-outer">
          <div class="comparison-hint">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"></polyline><polyline points="9 5 12 2 15 5"></polyline><polyline points="15 19 12 22 9 19"></polyline><polyline points="19 9 22 12 19 15"></polyline><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line></svg>
            Scroll pentru mai multe coloane
          </div>
          <div class="comparison-wrap">
            <table class="comparison-table">
              <thead><tr>${thHtml}</tr></thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </section>`;
  }

  // --- Build Guide HTML ---
  let guideHtml = '';
  if (content.guide) {
    let guideContent = content.guide.content;
    if (!guideContent.includes('<p>') && !guideContent.includes('<p ')) {
      guideContent = guideContent.split(/\n\n+/).map(p => p.trim()).filter(p => p).map(p => `<p>${p}</p>`).join('\n        ');
    }
    const guideId = slugify(stripStrong(content.guide.title));
    guideHtml = `
      <section id="${guideId}">
        <h2>${stripStrong(content.guide.title)}</h2>
        <div class="guide">
          ${guideContent}
        </div>
      </section>`;
  }

  // --- Build TOC ---
  const tocEntries = [];
  // Items
  content.items.forEach(item => {
    const itemId = 'item-' + slugify(stripStrong(item.name));
    tocEntries.push({ title: stripStrong(item.name), id: itemId });
  });
  // Comparison
  if (comparisonHtml) {
    tocEntries.push({ title: 'Comparatie resurse', id: 'comparatie' });
  }
  // Guide
  if (content.guide) {
    const guideId = slugify(stripStrong(content.guide.title));
    tocEntries.push({ title: stripStrong(content.guide.title), id: guideId });
  }

  const tocItems = tocEntries.map(e =>
    `{ title: "${e.title.replace(/"/g, '\\"')}", id: "${e.id}" }`
  );

  // --- Build FAQ HTML ---
  const faqHtml = content.faq.map((item, index) => `
            <div class="faq-item" id="faq-${index}">
              <button class="faq-question" onclick="this.parentElement.classList.toggle('open')">
                ${stripStrong(item.question)}
                <svg class="faq-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div class="faq-answer">
                ${stripStrong(item.answer)}
              </div>
            </div>`).join('\n');

  const faqArray = content.faq.map(item =>
    `{ question: "${stripStrong(item.question).replace(/"/g, '\\"')}", answer: "${stripStrong(item.answer).replace(/"/g, '\\"').replace(/\n/g, ' ')}" }`
  );

  // --- Inline script for comparison scroll + TOC tracking ---
  const inlineScript = `
  <script>
    // Comparison scroll hint
    (function(){
      const outer = document.getElementById('comparison-outer');
      if(outer){
        const wrap = /** @type {HTMLElement|null} */ (outer.querySelector('.comparison-wrap'));
        function checkScroll(){
          if(!wrap) return;
          if(wrap.scrollWidth > wrap.clientWidth + 2) outer?.classList.add('can-scroll');
          else outer?.classList.remove('can-scroll');
        }
        checkScroll();
        window.addEventListener('resize', checkScroll);
      }
    })();
    // TOC active tracking
    (function(){
      const tocLinks = document.querySelectorAll('.toc-item a');
      if(!tocLinks.length) return;
      const ids = Array.from(tocLinks).map(a => (a.getAttribute('href') || '').replace('#',''));
      const observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if(e.isIntersecting){
            tocLinks.forEach(a => a.parentElement?.classList.remove('active'));
            const match = Array.from(tocLinks).find(a => a.getAttribute('href') === '#' + e.target.id);
            if(match) match.parentElement?.classList.add('active');
          }
        });
      }, {rootMargin: '-20% 0px -60% 0px'});
      ids.forEach(id => { const el = document.getElementById(id); if(el) observer.observe(el); });
    })();
  </script>`;

  let pageContent = `---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import SimilarArticles from '../components/SimilarArticles.astro';
import PrevNextNav from '../components/PrevNextNav.astro';
import CookieBanner from '../components/CookieBanner.astro';
import keywordsData from '../../keywords.json';

const title = "${title.replace(/"/g, '\\"')}";
const excerpt = "${excerpt.replace(/"/g, '\\"')}";
const image = "${imagePath || '/images/articles/default.webp'}";
const category = "${category}";
const categorySlug = "${categorySlug}";
const date = "${date}";
const modifiedDate = "${date}";
const author = "${author.name}";
const authorRole = "${author.role}";
const authorBio = "${author.bio.replace(/"/g, '\\"')}";
const slug = "${slug}";

const faq = [
  ${faqArray.join(',\n  ')}
];

const toc = [
  ${tocItems.join(',\n  ')}
];

// Get all articles for similar articles component
const allArticles = (keywordsData.completed || []).map(item => ({
  title: item.title,
  slug: item.slug,
  excerpt: item.excerpt || '',
  image: item.image,
  category: item.category,
  categorySlug: item.categorySlug,
  date: item.date || new Date().toISOString()
}));
---

<Layout
  title={title}
  description={excerpt}
  image={image}
  article={true}
  publishedTime={date}
  modifiedTime={modifiedDate}
  author={author}
  faq={faq}
>
  <Header />

  <header class="article-header">
    <div class="container">
      <nav class="breadcrumb">
        <a href="/">Acasa</a>
        <span class="breadcrumb-separator">/</span>
        <a href={\`/\${categorySlug}/\`}>{category}</a>
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-current">{title}</span>
      </nav>

      <h1>{title}</h1>

      <div class="article-header-meta">
        <span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          {new Date(date).toLocaleDateString('ro-RO', { year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
        <span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          {author}
        </span>
        <span>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          {category}
        </span>
      </div>
    </div>
  </header>

  <article class="article-body">
    <div class="article-featured-image">
      <img src={image} alt={title} width="800" height="600" loading="eager" />
    </div>

    <nav class="toc">
      <h2 class="toc-title">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
        Cuprins
      </h2>
      <ol class="toc-list">
        {toc.map(item => (
          <li class="toc-item"><a href={\`#\${item.id}\`}>{item.title}</a></li>
        ))}
        <li class="toc-item"><a href="#faq">Intrebari Frecvente</a></li>
      </ol>
    </nav>

    <div class="article-content-body">
      <section id="intro">
        ${introHtml}
      </section>

      ${itemsHtml}

      ${comparisonHtml}

      ${guideHtml}

      <section class="faq-section" id="faq">
        <h2 class="faq-title">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          Intrebari Frecvente
        </h2>
        ${faqHtml}
      </section>
    </div>

    <div class="author-box">
      <div class="author-avatar">{author.charAt(0)}</div>
      <div class="author-info">
        <h4>{author}</h4>
        <p class="author-role">{authorRole}</p>
        <p class="author-bio">{authorBio}</p>
      </div>
    </div>

    <SimilarArticles
      articles={allArticles}
      currentSlug={slug}
      currentCategory={category}
    />

    <PrevNextNav
      currentSlug={slug}
      currentCategory={category}
      articles={allArticles}
    />
  </article>

  <Footer />
  <CookieBanner />
  ${inlineScript}
</Layout>
`;

  const outputPath = path.join(rootDir, 'src', 'pages', `${slug}.astro`);
  pageContent = stripFakeLinks(pageContent, path.join(rootDir, 'src', 'pages'));
  fs.writeFileSync(outputPath, pageContent);
  console.log(`  Article page created: ${outputPath}`);

  return {
    slug,
    title,
    excerpt,
    date
  };
}

// Main execution
async function main() {
  console.log('\n========================================');
  console.log('DictionarulTau.ro - Article Generator');
  console.log('========================================\n');

  // Read keywords
  const keywordsPath = path.join(rootDir, 'keywords.json');
  const keywordsData = JSON.parse(fs.readFileSync(keywordsPath, 'utf-8'));

  // Check for temp-articles.json (created by auto-generate.js)
  const tempArticlesPath = path.join(rootDir, 'temp-articles.json');
  let pending;

  if (fs.existsSync(tempArticlesPath)) {
    // Use temp-articles.json if it exists (from auto-generate.js)
    const tempData = JSON.parse(fs.readFileSync(tempArticlesPath, 'utf-8'));
    pending = tempData.articles || [];
    console.log(`Using temp-articles.json: ${pending.length} article(s) to generate\n`);
  } else {
    // Fallback to all pending keywords
    pending = keywordsData.pending || [];
    const numToGenerate = parseInt(process.argv[2]) || pending.length;
    pending = pending.slice(0, numToGenerate);
    console.log(`Using keywords.json: ${pending.length} article(s) to generate\n`);
  }

  if (pending.length === 0) {
    console.log('No pending keywords to process.');
    return;
  }

  // Ensure images directory exists
  const imagesDir = path.join(rootDir, 'public', 'images', 'articles');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const successfulKeywords = [];

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    console.log(`\n[${i + 1}/${pending.length}] Processing: ${item.keyword}`);
    console.log(`Category: ${item.category}`);

    try {
      // Find category slug
      const categoryInfo = keywordsData.categories.find(c => c.name === item.category);
      const categorySlug = categoryInfo?.slug || slugify(item.category);

      // Find author for this category
      const author = getAuthorForCategory(item.category);

      // Generate content
      console.log('  Generating content...');
      const content = await generateArticleContent(item.keyword, item.category, keywordsData?.completed || []);
      console.log('  Content generated successfully');

      // Generate image
      const slug = slugify(item.keyword);
      const imagePath = await generateImage(item.keyword, slug, item.categorySlug);

      // Create article page
      const articleData = createArticlePage(
        item.keyword,
        content,
        imagePath,
        item.category,
        categorySlug,
        author
      );

      // Add to successful
      successfulKeywords.push({
        keyword: item.keyword,
        title: articleData.title,
        slug: articleData.slug,
        excerpt: articleData.excerpt,
        image: imagePath || '/images/articles/default.webp',
        category: item.category,
        categorySlug: categorySlug,
        date: articleData.date,
        author: author.name
      });

      console.log(`  ✓ Completed: ${item.keyword}`);

      // Small delay between articles
      if (i < pending.length - 1) {
        console.log('  Waiting 2 seconds...');
        await sleep(2000);
      }

    } catch (error) {
      console.error(`  ✗ Failed: ${item.keyword} - ${error.message}`);
    }
  }

  // Write successful-keywords.json for auto-generate.js (full objects with excerpt and date)
  const successfulKeywordsPath = path.join(__dirname, 'successful-keywords.json');
  fs.writeFileSync(successfulKeywordsPath, JSON.stringify(successfulKeywords, null, 2));

  // Only update keywords.json if NOT using temp-articles.json (standalone mode)
  if (!fs.existsSync(tempArticlesPath) && successfulKeywords.length > 0) {
    const successfulSet = new Set(successfulKeywords.map(k => k.keyword));
    keywordsData.pending = keywordsData.pending.filter(k => !successfulSet.has(k.keyword));
    keywordsData.completed = [...(keywordsData.completed || []), ...successfulKeywords];

    fs.writeFileSync(keywordsPath, JSON.stringify(keywordsData, null, 2));
    console.log(`\nUpdated keywords.json: ${successfulKeywords.length} articles completed`);
  }

  console.log('\n========================================');
  console.log(`Total processed: ${successfulKeywords.length}/${pending.length}`);
  console.log('========================================\n');
}

main().catch(console.error);
