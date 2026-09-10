const knowledge = require('../data/ai_knowledge.json');

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value) =>
  normalize(value)
    .split(' ')
    .filter((word) => word.length >= 3);

const includesAny = (haystack, needles) =>
  needles.some((needle) => haystack.includes(normalize(needle)));

const bestPhraseMatch = (message, entry) => {
  const normalizedMessage = normalize(message);
  return (entry.phrases || []).some((phrase) => normalizedMessage.includes(normalize(phrase)));
};

const findModuleReply = (message) => {
  const normalizedMessage = normalize(message);
  for (const module of Object.values(knowledge.modules || {})) {
    const keywords = module.keywords || [];
    if (includesAny(normalizedMessage, keywords)) {
      return {
        reply: `**${module.label}:** ${module.description}`,
        context: {
          type: 'module',
          module: module.label,
        },
      };
    }
  }
  return null;
};

const findFaqReply = (message) => {
  for (const entry of knowledge.faqEntries || []) {
    if (bestPhraseMatch(message, entry)) {
      return {
        reply: entry.answer,
        context: {
          type: 'faq',
          category: entry.category,
        },
      };
    }
  }
  return null;
};

const findSeedReply = (message) => {
  const normalizedMessage = normalize(message);
  const words = tokenize(message);
  const matchedTopic = (knowledge.seedTopics || []).find((topic) => normalizedMessage.includes(normalize(topic)));
  if (!matchedTopic) {
    return null;
  }

  const intentHit = (knowledge.seedIntents || []).find((intent) => normalizedMessage.includes(normalize(intent)));
  if (!intentHit && words.length < 2) {
    return null;
  }

  return {
    reply: `**${matchedTopic}:** SAM can help with ${intentHit || 'this topic'}. Tell me the employee, date, status, module, or exact problem so I can give the next best step.`,
    context: {
      type: 'seed',
      topic: matchedTopic,
      intent: intentHit || '',
    },
  };
};

const generateReply = (message) => {
  const normalized = normalize(message);

  if (!normalized) {
    return {
      reply: knowledge.general.fallback,
      context: { type: 'fallback', reason: 'empty' },
    };
  }

  if (includesAny(normalized, ['hello', 'hi', 'hey', 'kumusta', 'kamusta'])) {
    return {
      reply: knowledge.general.greeting,
      context: { type: 'greeting' },
    };
  }

  if (includesAny(normalized, ['waray', 'tagalog', 'bisaya', 'english', 'language', 'dialect', 'mixed'])) {
    return {
      reply: knowledge.general.languages,
      context: { type: 'language' },
    };
  }

  if (includesAny(normalized, ['what are the modules', 'what can this system do', 'list the modules', 'what features are available'])) {
    return {
      reply: knowledge.general.moduleList,
      context: { type: 'modules' },
    };
  }

  if (includesAny(normalized, ['what is samelco ii', 'tell me about samelco', 'about the company'])) {
    return {
      reply: knowledge.general.company,
      context: { type: 'company' },
    };
  }

  const faq = findFaqReply(message);
  if (faq) {
    return faq;
  }

  const moduleReply = findModuleReply(message);
  if (moduleReply) {
    return moduleReply;
  }

  const seedReply = findSeedReply(message);
  if (seedReply) {
    return seedReply;
  }

  return {
    reply: knowledge.general.fallback,
    context: { type: 'fallback', reason: 'no_match' },
  };
};

module.exports = {
  generateReply,
};
