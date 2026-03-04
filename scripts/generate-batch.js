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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Translate title to English using Gemini
async function translateToEnglish(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const apiKey = getNextGeminiKey();
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
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
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
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
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
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
async function generateArticleContent(keyword, category) {

  const prompt = `Esti un expert in educatie, limba romana si resurse de invatare care scrie pe un blog romanesc. Scrii intr-un stil direct, conversational, ca un prieten care se pricepe si iti da sfaturi concrete. NU esti un AI. Esti un om real cu experienta reala.

Keyword: "${keyword}"
Categorie: "${category}"

GENEREAZA un articol complet in format JSON cu structura de mai jos. Articolul trebuie sa fie informativ, natural, scris de un om care chiar stie domeniul. Fara diacritice. Intre 1500-2500 de cuvinte.

=== 1. SEARCH INTENT MAPPING (CRITIC) ===
Structura articolului urmeaza EXACT ce cauta userul cand tasteaza "${keyword}" in Google:
- PRIMA sectiune = raspunsul direct, concret, fara introducere, fara "bun venit", fara preambul. Userul vrea raspunsul ACUM.
- Dupa raspunsul direct, vin detaliile, comparatiile, criteriile de alegere.
- Fiecare sectiune raspunde la o sub-intrebare pe care userul o are in minte.
- NU incepe NICIODATA cu o introducere generica. Prima propozitie = recomandarea ta directa sau raspunsul la intentia de cautare.
- Excerptul = primele 2-3 propozitii din articol care dau raspunsul direct. Asta apare in Google ca snippet.

=== 2. ANTI-AI FOOTPRINT (FOARTE IMPORTANT) ===
Articolul TREBUIE sa para scris de un om real, nu de AI. Reguli concrete:
- FARA tranzitii generice: NU folosi "Asadar", "In primul rand", "De asemenea", "Cu toate acestea", "Este important de mentionat", "Trebuie sa tinem cont", "Nu in ultimul rand"
- FARA structura predictibila: nu toate paragrafele sa aiba aceeasi lungime. Amesteca: un paragraf de 2 propozitii, urmat de unul de 4, apoi unul de 1 propozitie.
- IMPERFECTIUNI NATURALE: include formulari imperfecte dar naturale: "bon, stai", "cum sa zic", "pana la urma", "na, asta e", "ma rog", "zic si eu"
- Amesteca propozitii FOARTE scurte (3-5 cuvinte: "Merita. Punct." / "Nu-i rau." / "Depinde de buget.") cu propozitii lungi (18-22 cuvinte)
- Foloseste MULT limbaj conversational romanesc: "na", "uite", "stai putin", "pe bune", "sincer", "daca ma intrebi pe mine", "am sa fiu direct", "uite care-i treaba"
- INTERZIS TOTAL: "in era actuala", "descopera", "fara indoiala", "ghid complet", "in concluzie", "in acest articol", "hai sa exploram", "sa aprofundam", "merita mentionat", "este esential", "este crucial", "o alegere excelenta"
- INTERZIS: liste de 3 adjective consecutive, inceperea a doua propozitii la rand cu acelasi cuvant, folosirea aceluiasi pattern de inceput de paragraf
- Include anecdote personale CONCRETE: "am avut un X care a tinut 4 ani", "un prieten si-a luat un Y si dupa 2 luni...", "am testat personal modelul asta vreo 3 saptamani"
- Include critici ONESTE: fiecare produs sa aiba minim 1-2 minusuri reale, nu critici false gen "singurul minus e ca e prea bun"
- Recunoaste incertitudine: "n-am testat personal, dar din ce am auzit...", "pe asta nu pun mana in foc, dar..."
- Vorbeste ca pe un forum romanesc, nu ca o enciclopedie

=== 3. FAQ OPTIMIZAT PEOPLE ALSO ASK ===
8 intrebari formatate EXACT cum le tasteaza oamenii in Google Romania:
- Foloseste formulari naturale de cautare: "cat costa...", "care e diferenta intre...", "merita sa...", "ce ... e mai bun", "de ce...", "cum sa...", "unde gasesc..."
- FARA intrebari artificiale sau formale. Gandeste-te: ce ar tasta un roman in Google?
- Raspunsurile au structura de FEATURED SNIPPET: prima propozitie = raspunsul direct si clar, apoi 1-2 propozitii cu detalii si cifre concrete
- Raspuns = 40-70 cuvinte, auto-suficient (sa poata fi afisat singur ca snippet fara context)
- Include cifre concrete: preturi in lei, procente, durate, dimensiuni
- Acoperiti: pret, comparatie, durabilitate, alegere, probleme frecvente, intretinere, autenticitate, unde sa cumperi

=== 4. LIZIBILITATE PERFECTA PARAGRAFE ===
- MAXIM 3-4 propozitii per paragraf. Niciodata mai mult.
- Paragrafele lungi sunt INTERZISE. Daca un paragraf are mai mult de 4 propozitii, sparge-l.
- Alterna paragrafele: unul mai lung (3-4 prop), unul scurt (1-2 prop), unul mediu (2-3 prop)
- Intre sectiuni lasa "aer" - nu pune paragraf dupa paragraf fara pauza
- Foloseste bullet points (<ul><li>) pentru liste de criterii, avantaje, dezavantaje - nu le pune in text continuu
- Subtitlurile (H3) sparg monotonia - foloseste-le in cadrul sectiunilor pentru a crea sub-puncte

=== 5. CUVINTE CHEIE IN STRONG ===
- Pune keyword-ul principal si variatiile lui in <strong> tags de fiecare data cand apar natural in text
- Keyword principal: "${keyword}" - trebuie sa apara de 4-6 ori in tot articolul, in <strong>
- Variatii naturale ale keyword-ului: pune si ele in <strong>
- NU pune in strong cuvinte random sau irelevante. Doar keyword-urile si variatiile lor.
- Nu forta keyword density. Trebuie sa sune natural, ca si cum ai sublinia ce e important.
- NICIODATA nu pune <strong> in titluri de sectiuni (heading), in intrebarile FAQ, sau in textul din cuprins/TOC. Strong se foloseste DOAR in paragrafe de text (<p>), nu in <h2>, <h3>, "question", sau "heading".

=== REGULI SUPLIMENTARE ===
- Scrie FARA diacritice (fara ă, î, ș, ț, â - foloseste a, i, s, t)
- Preturile sa fie in LEI si realiste pentru piata din Romania
- Fiecare sectiune minim 250 cuvinte

STRUCTURA JSON (returneaza DOAR JSON valid, fara markdown, fara \`\`\`):
{
  "excerpt": "Primele 2-3 propozitii care dau raspunsul direct la ce cauta userul. Recomandarea concreta + context scurt. FARA introducere.",
  "sections": [
    {
      "title": "Titlu sectiune cu keyword integrat natural",
      "content": "HTML formatat cu <p>, <strong>, <ul>/<li>. Minim 250 cuvinte per sectiune. Paragrafele separate cu </p><p>. Maxim 3-4 propozitii per paragraf."
    }
  ],
  "faq": [
    {
      "question": "Intrebare EXACT cum ar tasta-o un roman in Google",
      "answer": "Prima propozitie = raspuns direct (featured snippet). Apoi 1-2 propozitii cu detalii si cifre. Total 40-70 cuvinte."
    }
  ]
}

SECTIUNI OBLIGATORII (6 sectiuni, titluri creative, NU generice):
1. [Raspuns direct] - recomandarea ta principala cu explicatie, fara preambul (titlu creativ legat de keyword, NU "raspunsul direct")
2. [Top recomandari] - 4-5 produse cu preturi reale in lei, avantaje si dezavantaje oneste (cu minusuri reale)
3. [Criterii de alegere] - pe ce sa te uiti cand alegi, explicat pe intelesul tuturor, cu exemple concrete
4. [Comparatie] - head-to-head intre 2-3 optiuni populare, cu preturi si diferente clare
5. [Greseli si tips] - ce sa eviti, sfaturi de insider, greseli pe care le fac toti
6. [Verdict pe buget] - recomandare finala pe 3 categorii de buget: mic, mediu, mare (NU folosi cuvantul "concluzie")

FAQ: 8 intrebari naturale, formulari de cautare Google reale, raspunsuri cu structura featured snippet.`;

  let retries = 5;
  while (retries > 0) {
    const apiKey = getNextGeminiKey();
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
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
            maxOutputTokens: 16000
          }
        })
      });

      const data = await response.json();

      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        let text = data.candidates[0].content.parts[0].text;
        // Clean JSON
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        // Extract JSON object if there's extra text
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          text = jsonMatch[0];
        }

        try {
          const parsed = JSON.parse(text);
          if (parsed.excerpt && parsed.sections && parsed.faq) {
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
        console.error('  No content in response');
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

// Create article page
function createArticlePage(keyword, content, imagePath, category, categorySlug, author) {
  const slug = slugify(keyword);
  const title = capitalizeFirst(keyword);
  const date = new Date().toISOString();

  // Convert markdown in content
  content.sections = content.sections.map(section => ({
    ...section,
    title: markdownToHtml(section.title),
    content: markdownToHtml(section.content)
  }));
  content.faq = content.faq.map(item => ({
    ...item,
    question: markdownToHtml(item.question),
    answer: markdownToHtml(item.answer)
  }));
  content.excerpt = markdownToHtml(content.excerpt);
  content.excerpt = content.excerpt.replace(/<[^>]*>/g, '');  // Strip HTML tags from excerpt

  // Generate table of contents
  const tocItems = content.sections.map((section, index) => {
    const sectionId = slugify(stripStrong(section.title));
    return `{ title: "${stripStrong(section.title).replace(/"/g, '\\"')}", id: "${sectionId}" }`;
  });

  // Generate sections HTML
  const sectionsHtml = content.sections.map(section => {
    const sectionId = slugify(stripStrong(section.title));
    let sectionContent = section.content;

    // Normalize: if content already has <p> tags, strip them first
    if (sectionContent.includes('<p>') || sectionContent.includes('<p ')) {
      sectionContent = sectionContent
        .replace(/<\/p>\s*<p>/g, '\n')
        .replace(/<p[^>]*>/g, '')
        .replace(/<\/p>/g, '\n');
    }

    // Insert breaks around block-level elements so they get properly separated
    sectionContent = sectionContent
      .replace(/(<(?:h[1-6]|ul|ol|blockquote|table|div)[\s>])/gi, '\n\n$1')
      .replace(/(<\/(?:h[1-6]|ul|ol|blockquote|table|div)>)/gi, '$1\n\n');

    // Split into blocks and wrap text in <p>, leave block elements as-is
    let blocks = sectionContent.split(/\n\n+/).map(p => p.trim()).filter(p => p);
    // Fallback: if \n\n split produced a single large block, try splitting on \n
    if (blocks.length <= 1 && sectionContent.includes('\n')) {
      blocks = sectionContent.split(/\n/).map(p => p.trim()).filter(p => p);
    }
    sectionContent = blocks.map(p => {
      if (p.match(/^<(?:ul|ol|h[1-6]|table|blockquote|div|section)/i)) {
        return p;
      }
      return `<p>${p}</p>`;
    }).join('\n        ');

    // Split overly long paragraphs for better readability
    sectionContent = sectionContent.replace(/<p>([\s\S]*?)<\/p>/g, (match, inner) => {
      if (inner.length < 500) return match;
      // Split on sentence boundaries (. followed by space and uppercase letter)
      const sentences = inner.split(/(?<=\.)\s+(?=[A-Z])/);
      if (sentences.length <= 3) return match;
      // Group sentences into paragraphs of 2-4 sentences
      const paragraphs = [];
      let current = [];
      let currentLen = 0;
      for (const s of sentences) {
        current.push(s);
        currentLen += s.length;
        if (current.length >= 3 || currentLen > 400) {
          paragraphs.push(current.join(' '));
          current = [];
          currentLen = 0;
        }
      }
      if (current.length > 0) paragraphs.push(current.join(' '));
      if (paragraphs.length <= 1) return match;
      return paragraphs.map(p => `<p>${p}</p>`).join('\n        ');
    });

    return `
      <section id="${sectionId}">
        <h2>${stripStrong(section.title)}</h2>
        ${sectionContent}
      </section>`;
  }).join('\n');

  // Generate FAQ HTML
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

  const pageContent = `---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import SimilarArticles from '../components/SimilarArticles.astro';
import CookieBanner from '../components/CookieBanner.astro';
import keywordsData from '../../keywords.json';

const title = "${title.replace(/"/g, '\\"')}";
const excerpt = "${content.excerpt.replace(/"/g, '\\"')}";
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
      ${sectionsHtml}

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
  </article>

  <Footer />
  <CookieBanner />
</Layout>
`;

  const outputPath = path.join(rootDir, 'src', 'pages', `${slug}.astro`);
  fs.writeFileSync(outputPath, pageContent);
  console.log(`  Article page created: ${outputPath}`);

  return {
    slug,
    title,
    excerpt: content.excerpt,
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
      const content = await generateArticleContent(item.keyword, item.category);
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
        excerpt: content.excerpt,
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
