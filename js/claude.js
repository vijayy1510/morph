// Optional "Deep file" feature: sends the image to Claude and gets rich info back as JSON.
// Needs an Anthropic API key (get one at https://console.anthropic.com).

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm';

const PROMPT = `Look at this image and tell me everything interesting about it, for a comic-book themed website aimed at Gen Z users.
- identity: who or what the main subject is. Name fictional characters (superheroes, cartoon, anime and game characters), animal species or breeds, landmarks, products, artworks and famous objects. If the subject is a real person, do NOT identify them from their face: use "A person" (or "A person dressed as <character>" for cosplay) and describe them instead. Set confidence honestly and use "low" when you are guessing.
- title: a short name for what's shown.
- emoji: one emoji that fits.
- category: e.g. Character, Animal, Food, Landmark, Person, Product, Art, Nature, Vehicle, Screenshot.
- description: 2–3 sentences describing what's in the image.
- details: 4–8 key facts as label/value pairs (for characters: universe, alter ego, first appearance, powers; otherwise things like species, location guess, era, materials, style, brand, estimated size). Say "likely" when unsure.
- fun_facts: 3 genuinely interesting facts about the main subject.
- vibe and aesthetic: the mood in a few words, and an aesthetic name (e.g. cottagecore, Y2K, dark academia).
- caption_ideas: 3 short social-media captions in a Gen Z tone.
- hashtags: 6 relevant hashtags without spaces.
Only state facts you are confident are true.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['identity', 'title', 'emoji', 'category', 'description', 'details', 'fun_facts', 'vibe', 'aesthetic', 'caption_ideas', 'hashtags'],
  properties: {
    identity: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'kind', 'confidence'],
      properties: {
        name: { type: 'string' },
        kind: { type: 'string' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      },
    },
    title: { type: 'string' },
    emoji: { type: 'string' },
    category: { type: 'string' },
    description: { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'value'],
        properties: { label: { type: 'string' }, value: { type: 'string' } },
      },
    },
    fun_facts: { type: 'array', items: { type: 'string' } },
    vibe: { type: 'string' },
    aesthetic: { type: 'string' },
    caption_ideas: { type: 'array', items: { type: 'string' } },
    hashtags: { type: 'array', items: { type: 'string' } },
  },
};

export async function getInsights({ apiKey, model, canvas }) {
  const { default: Anthropic } = await import(SDK_URL);
  // Browser use is fine for a personal, local site. For a public site, move this call to a backend server.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const imageData = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];

  let response;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageData } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('That API key was rejected. Check it in Settings.');
    if (err instanceof Anthropic.RateLimitError) throw new Error('Rate limited. Wait a moment and try again.');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('Could not reach the Claude API. Check your internet.');
    if (err instanceof Anthropic.APIError) throw new Error(`Claude API error ${err.status ?? ''}: ${err.message}`);
    throw err;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error("Claude couldn't analyze this image. Try a different one.");
  }
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Claude returned an empty answer. Try again.');
  return JSON.parse(text);
}
