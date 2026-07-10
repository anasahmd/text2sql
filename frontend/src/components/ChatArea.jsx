import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, User, Bot, DatabaseZap, Play, X, Pencil, ShieldCheck, ShieldAlert } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SqlDisplay from './SqlDisplay';

const EXAMPLE_QUERIES = [
  'How many customers are there?',
  'Show top 5 most expensive products',
  'Which category has the most products?',
  'List all orders with status delivered',
];

const ChatArea = ({ apiBase, isConnected }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingQuery, setPendingQuery] = useState(null); // { sql, message, validation }
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Reset messages when connection state changes
  useEffect(() => {
    if (isConnected) {
      setMessages([{
        role: 'bot',
        text: '**Database connected!** 🎉\n\nAsk me anything about your data in plain English. I\'ll generate the SQL for you to review before executing.',
        sql: null,
      }]);
      setPendingQuery(null);
    } else {
      setMessages([]);
      setPendingQuery(null);
    }
  }, [isConnected]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingQuery, scrollToBottom]);

  // Step 1: Generate SQL (no execution)
  const sendMessage = async (text) => {
    if (!text.trim() || !isConnected || isLoading || pendingQuery) return;

    const userMessage = text.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${apiBase}/chat/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate SQL');

      // Show SQL for review instead of executing immediately
      setPendingQuery({
        sql: data.sql,
        message: userMessage,
        validation: data.validation,
      });
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: `**Error:** ${err.message}`,
        sql: null,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Execute approved SQL
  const executeQuery = async (sql) => {
    if (!sql.trim() || !pendingQuery) return;

    const originalMessage = pendingQuery.message;
    setPendingQuery(null);
    setIsLoading(true);

    try {
      const res = await fetch(`${apiBase}/chat/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, message: originalMessage }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to execute query');

      setMessages(prev => [...prev, {
        role: 'bot',
        text: data.answer,
        sql: data.sql,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: `**Error:** ${err.message}`,
        sql: sql,
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  // Cancel pending query
  const cancelQuery = () => {
    setPendingQuery(null);
    setMessages(prev => [...prev, {
      role: 'bot',
      text: '*Query cancelled.* Ask me something else!',
      sql: null,
    }]);
    inputRef.current?.focus();
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleExampleClick = (query) => {
    setInput(query);
    sendMessage(query);
  };

  // Empty state when not connected
  if (!isConnected) {
    return (
      <div className="chat-container">
        <div className="empty-state">
          <div className="empty-icon-wrap">
            <DatabaseZap />
          </div>
          <h2>No Database Connected</h2>
          <p>Connect to a SQL database using the sidebar to start asking questions in natural language.</p>
        </div>
      </div>
    );
  }

  // Connected empty state with example queries
  if (messages.length <= 1 && !isLoading && !pendingQuery) {
    return (
      <div className="chat-container">
        <div className="messages-list">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
        </div>
        <div className="empty-state" style={{ flex: 'unset', paddingTop: '40px' }}>
          <p>Try one of these example queries:</p>
          <div className="example-queries">
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                className="example-query"
                onClick={() => handleExampleClick(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
        <InputBar
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          isConnected={isConnected}
          isLoading={isLoading}
          hasPending={!!pendingQuery}
          inputRef={inputRef}
        />
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="messages-list">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {isLoading && !pendingQuery && (
          <div className="message bot">
            <div className="message-avatar">
              <Bot size={18} />
            </div>
            <div className="message-content">
              <div className="message-bubble">
                <div className="loading-indicator">
                  <div className="loading-dot" />
                  <div className="loading-dot" />
                  <div className="loading-dot" />
                </div>
              </div>
            </div>
          </div>
        )}

        {pendingQuery && (
          <SqlReviewCard
            pendingQuery={pendingQuery}
            onExecute={executeQuery}
            onCancel={cancelQuery}
            isLoading={isLoading}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      <InputBar
        input={input}
        setInput={setInput}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        isConnected={isConnected}
        isLoading={isLoading}
        hasPending={!!pendingQuery}
        inputRef={inputRef}
      />
    </div>
  );
};

/** SQL Review Card — user can inspect, edit, and approve/cancel the query */
const SqlReviewCard = ({ pendingQuery, onExecute, onCancel, isLoading }) => {
  const [editedSql, setEditedSql] = useState(pendingQuery.sql);
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef(null);

  const isValid = pendingQuery.validation?.valid !== false;

  // Auto-resize textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
      textareaRef.current.focus();
    }
  }, [isEditing, editedSql]);

  return (
    <div className="message bot">
      <div className="message-avatar">
        <Bot size={18} />
      </div>
      <div className="message-content">
        <div className="sql-review-card">
          <div className="sql-review-header">
            <div className="sql-review-title">
              {isValid ? (
                <><ShieldCheck size={15} className="validation-icon valid" /> Generated SQL — Ready for review</>
              ) : (
                <><ShieldAlert size={15} className="validation-icon invalid" /> Generated SQL — Validation failed</>
              )}
            </div>
            {!isValid && (
              <div className="sql-review-warning">
                {pendingQuery.validation?.reason}
              </div>
            )}
          </div>

          <div className="sql-review-body">
            {isEditing ? (
              <textarea
                ref={textareaRef}
                className="sql-edit-textarea"
                value={editedSql}
                onChange={(e) => setEditedSql(e.target.value)}
                spellCheck={false}
              />
            ) : (
              <pre className="sql-review-code">{editedSql}</pre>
            )}
          </div>

          <div className="sql-review-actions">
            <button
              className="btn btn-icon btn-edit"
              onClick={() => setIsEditing(!isEditing)}
              title={isEditing ? 'Done editing' : 'Edit query'}
            >
              <Pencil size={14} />
              {isEditing ? 'Done' : 'Edit'}
            </button>
            <div className="sql-review-actions-right">
              <button
                className="btn btn-icon btn-cancel"
                onClick={onCancel}
                disabled={isLoading}
              >
                <X size={14} /> Cancel
              </button>
              <button
                className="btn btn-icon btn-execute"
                onClick={() => onExecute(editedSql)}
                disabled={isLoading || !editedSql.trim()}
              >
                {isLoading ? 'Running...' : <><Play size={14} /> Execute</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Individual message bubble */
const MessageBubble = ({ message }) => (
  <div className={`message ${message.role}`}>
    <div className="message-avatar">
      {message.role === 'user' ? <User size={18} /> : <Bot size={18} />}
    </div>
    <div className="message-content">
      <div className="message-bubble">
        {message.role === 'bot' ? (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.text}
            </ReactMarkdown>
          </div>
        ) : (
          message.text
        )}
      </div>
      {message.role === 'bot' && message.sql && (
        <SqlDisplay sql={message.sql} />
      )}
    </div>
  </div>
);

/** Chat input bar */
const InputBar = ({ input, setInput, onSubmit, onKeyDown, isConnected, isLoading, hasPending, inputRef }) => (
  <div className="input-area">
    <form onSubmit={onSubmit}>
      <div className="input-wrapper">
        <textarea
          ref={inputRef}
          id="chat-input"
          className="chat-input"
          placeholder={hasPending ? 'Review the SQL above first...' : isConnected ? 'Ask about your data...' : 'Connect a database first...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={!isConnected || isLoading || hasPending}
          rows={1}
        />
        <button
          id="send-btn"
          type="submit"
          className="send-btn"
          disabled={!isConnected || isLoading || !input.trim() || hasPending}
        >
          <Send size={16} />
        </button>
      </div>
    </form>
  </div>
);

export default ChatArea;
