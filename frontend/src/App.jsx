import { useState } from 'react';
import ConnectionPanel from './components/ConnectionPanel';
import ChatArea from './components/ChatArea';
import { DatabaseZap } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [dbType, setDbType] = useState('');
  const [schema, setSchema] = useState(null);

  const handleConnect = (type, schemaData) => {
    setDbType(type);
    setSchema(schemaData);
    setIsConnected(true);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setDbType('');
    setSchema(null);
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="logo">
          <div className="logo-icon-wrap">
            <DatabaseZap size={22} />
          </div>
          <span className="logo-text">Text2SQL</span>
        </div>

        <ConnectionPanel
          apiBase={API_BASE}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          isConnected={isConnected}
          dbType={dbType}
          schema={schema}
        />
      </div>

      <ChatArea
        apiBase={API_BASE}
        isConnected={isConnected}
      />
    </div>
  );
}

export default App;
