import React, { useState } from 'react';
import { api } from '../../services/api';
import { MessageSquareText, Send, Bot, User, Sparkles, Tag, HelpCircle } from 'lucide-react';

/**
 * Lightweight inline markdown renderer for bold (**), italic (*), and inline code (`).
 * Returns an array of React elements.
 */
function renderInlineMarkdown(text) {
  if (!text) return text;
  // Split by markdown patterns: **bold**, *italic*, `code`
  const parts = [];
  // Regex: match **bold**, *italic*, or `code`
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Push text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(<strong key={match.index} style={{ fontWeight: '700' }}>{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4]) {
      // `code`
      parts.push(
        <code
          key={match.index}
          style={{
            background: 'var(--bg-tertiary)',
            padding: '0.1rem 0.35rem',
            borderRadius: '4px',
            fontSize: '0.8em',
            fontFamily: 'monospace',
          }}
        >
          {match[4]}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export function ChatPanel({ runId }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hello! I am your **reconnAIssance Settlement Assistant**. Ask me anything regarding settlement shortfalls, fee deductions (2% MDR + 18% GST), batch payout timing (T+2), or audit log reasons for this reconciliation run.",
      cited_audit_log_ids: [],
    },
  ]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const suggestedQuestions = [
    'Why did settlement batch STL-1001 fall short of gross sales?',
    'Explain how the 2% Razorpay fee and 18% GST deduction are calculated.',
    'What were the primary failure reasons for flagged exceptions in this run?',
    'What is the measured precision and recall on the held-out test split?',
  ];

  const handleSend = async (qText) => {
    const question = qText || inputQuestion;
    if (!question.trim() || !runId) return;

    const userMsg = { role: 'user', content: question, cited_audit_log_ids: [] };
    setMessages((prev) => [...prev, userMsg]);
    setInputQuestion('');
    setLoading(true);

    try {
      const res = await api.askQuestion({
        run_id: runId,
        question: question,
        session_id: sessionId,
      });

      if (res.session_id) setSessionId(res.session_id);

      const botMsg = {
        role: 'assistant',
        content: res.answer,
        cited_audit_log_ids: res.cited_audit_log_ids || [],
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ Failed to get answer: ${err.message}`,
          cited_audit_log_ids: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', height: '650px', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-indigo))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Bot size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700' }}>Settlement Q&A Agent</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Operational financial assistant answering queries backed by cited audit trail entries
            </p>
          </div>
        </div>
        <span className="badge badge-ai" style={{ fontSize: '0.7rem' }}>
          Gemini 2.0 Flash
        </span>
      </div>

      {/* Suggested Questions */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
        {suggestedQuestions.map((sq, idx) => (
          <button
            key={idx}
            className="btn btn-outline"
            style={{
              padding: '0.35rem 0.65rem',
              fontSize: '0.75rem',
              whiteSpace: 'nowrap',
              borderRadius: '9999px',
            }}
            onClick={() => handleSend(sq)}
            disabled={loading}
          >
            <Sparkles size={12} color="var(--accent-cyan)" />
            {sq}
          </button>
        ))}
      </div>

      {/* Chat Messages Log */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingRight: '0.5rem' }}>
        {messages.map((m, idx) => {
          const isBot = m.role === 'assistant';
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: '0.65rem',
                alignItems: 'flex-start',
                alignSelf: isBot ? 'flex-start' : 'flex-end',
                maxWidth: '85%',
              }}
            >
              {isBot && (
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'var(--accent-cyan)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  <Bot size={15} />
                </div>
              )}

              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  background: isBot ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, var(--accent-blue), var(--accent-indigo))',
                  color: isBot ? 'var(--text-primary)' : '#ffffff',
                  fontSize: '0.85rem',
                  lineHeight: '1.5',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {renderInlineMarkdown(m.content)}
                </div>

                {/* Cited Audit Entries */}
                {m.cited_audit_log_ids && m.cited_audit_log_ids.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.65rem',
                      paddingTop: '0.45rem',
                      borderTop: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Cited Logs:</span>
                    {m.cited_audit_log_ids.map((id) => (
                      <span key={id} className="badge badge-fuzzy" style={{ fontSize: '0.65rem', padding: '0.05rem 0.35rem' }}>
                        #{id}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {!isBot && (
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'var(--bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-primary)',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  <User size={15} />
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <Bot size={18} className="animate-spin" />
            Analyzing reconciled ledger context and fee tables...
          </div>
        )}
      </div>

      {/* Input Field */}
      <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          className="input-field"
          placeholder="Ask a question regarding settlement batches, deductions, or recon metrics..."
          value={inputQuestion}
          onChange={(e) => setInputQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          disabled={loading}
        />
        <button
          className="btn btn-primary"
          style={{ padding: '0 1.25rem' }}
          onClick={() => handleSend()}
          disabled={loading || !inputQuestion.trim()}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
