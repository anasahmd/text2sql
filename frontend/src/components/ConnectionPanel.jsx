import { useState } from 'react';
import {
  Link, Unlink, CircleCheck, CircleAlert, Table2,
  ChevronRight, Zap, KeyRound
} from 'lucide-react';

const ConnectionPanel = ({ apiBase, onConnect, onDisconnect, isConnected, dbType, schema }) => {
  const [uri, setUri] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedTables, setExpandedTables] = useState({});

  const handleConnect = async (e) => {
    e.preventDefault();
    const connectUri = uri.trim();
    if (!connectUri) return;

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(`${apiBase}/db/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: connectUri }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to connect');

      onConnect(data.type, data.schema);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch(`${apiBase}/db/disconnect`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
    setUri('');
    setExpandedTables({});
    onDisconnect();
  };

  const handleSampleConnect = () => {
    setUri('sample.sqlite');
  };

  const toggleTable = (name) => {
    setExpandedTables(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const tableNames = schema ? Object.keys(schema) : [];

  const formatDbType = (type) => {
    const labels = {
      'better-sqlite3': 'SQLite',
      'postgres': 'PostgreSQL',
      'mysql': 'MySQL',
    };
    return labels[type] || type;
  };

  return (
    <div className="connection-panel">
      {!isConnected ? (
        <>
          <form onSubmit={handleConnect}>
            <div className="form-group">
              <label className="form-label">Connection URI</label>
              <input
                id="db-uri-input"
                type="text"
                className="form-input"
                placeholder="postgres://user:pass@host/db"
                value={uri}
                onChange={(e) => setUri(e.target.value)}
                disabled={isLoading}
              />
              <div className="form-hint">
                Supports PostgreSQL, MySQL, and SQLite file paths
              </div>
            </div>

            {error && (
              <div className="status-badge error">
                <CircleAlert size={13} />
                {error}
              </div>
            )}

            <button
              id="connect-btn"
              type="submit"
              className="btn btn-primary mt-16"
              disabled={isLoading || !uri.trim()}
            >
              {isLoading ? 'Connecting...' : <><Link size={16} /> Connect</>}
            </button>
          </form>

          <div className="divider" />

          <button
            id="sample-db-btn"
            type="button"
            className="btn btn-sample"
            onClick={handleSampleConnect}
          >
            <Zap size={14} /> Try with sample database
          </button>
        </>
      ) : (
        <div className="flex-col gap-8">
          <div className="status-badge connected">
            <CircleCheck size={13} />
            Connected — {formatDbType(dbType)}
          </div>

          <button
            id="disconnect-btn"
            type="button"
            className="btn btn-ghost mt-12"
            onClick={handleDisconnect}
          >
            <Unlink size={16} /> Disconnect
          </button>

          {tableNames.length > 0 && (
            <div className="schema-section">
              <div className="schema-header">
                <label className="form-label" style={{ margin: 0 }}>Tables</label>
                <span className="schema-count">{tableNames.length}</span>
              </div>

              <ul className="schema-list">
                {tableNames.map((tableName) => {
                  const columns = schema[tableName] || [];
                  const isExpanded = expandedTables[tableName];

                  return (
                    <li key={tableName} className="schema-item-wrapper">
                      <div
                        className={`schema-item ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => toggleTable(tableName)}
                      >
                        <Table2 size={14} className="schema-icon" />
                        <span className="schema-table-name">{tableName}</span>
                        <ChevronRight size={14} className="chevron" />
                      </div>

                      {isExpanded && columns.length > 0 && (
                        <ul className="schema-columns">
                          {columns.map((col) => (
                            <li key={col.name} className="schema-column">
                              <span className="col-name">{col.name}</span>
                              <span className="col-type">{col.type}</span>
                              {col.primaryKey && (
                                <span className="col-badge pk">
                                  <KeyRound size={9} style={{ display: 'inline', verticalAlign: 'middle' }} /> PK
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConnectionPanel;
