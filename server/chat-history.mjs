import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function readChatHistory(rootDir, nodeId) {
  const filePath = chatHistoryPath(rootDir, nodeId);
  if (!existsSync(filePath)) return [];
  try {
    const data = JSON.parse(await readFile(filePath, 'utf8'));
    return Array.isArray(data.messages) ? data.messages : [];
  } catch {
    return [];
  }
}

export async function writeChatHistory(rootDir, nodeId, messages) {
  const filePath = chatHistoryPath(rootDir, nodeId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify({
    nodeId,
    updatedAt: new Date().toISOString(),
    messages: normalizeChatMessages(messages).slice(-160)
  }, null, 2));
}

export function summarizeChatHistory(nodeId, messages) {
  if (!messages.length) return { nodeId, totalMessages: 0, conversations: [] };

  const conversations = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i].role !== 'user') continue;
    const userQuestion = messages[i].text;
    const next = messages[i + 1];
    const aiAnswer = next?.role === 'agent' ? next.text : '';
    conversations.push({
      userQuestion: userQuestion.slice(0, 120),
      aiSummary: aiAnswer.slice(0, 150),
      messageCount: aiAnswer ? 2 : 1
    });
  }

  return {
    nodeId,
    totalMessages: messages.length,
    conversations: conversations.slice(-5)
  };
}

export function normalizeChatMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => ['user', 'agent'].includes(message.role) && typeof message.text === 'string');
}

function chatHistoryPath(rootDir, nodeId) {
  const safeId = String(nodeId || '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '_').slice(0, 140) || 'node';
  return path.join(rootDir || process.cwd(), 'data', 'chat-history', `${safeId}.json`);
}
