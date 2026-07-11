// Debug utilities para rastrear problemas

export function debugLog(component, message, data = null) {
  const timestamp = new Date().toLocaleTimeString();
  const style = 'color: #00D084; font-weight: bold;';
  console.log(`%c[${timestamp}] ${component}: ${message}`, style, data || '');
}

export function debugError(component, message, error) {
  const timestamp = new Date().toLocaleTimeString();
  const style = 'color: #ff6b6b; font-weight: bold;';
  console.error(`%c[${timestamp}] ${component} ERROR: ${message}`, style, error);
}

export function setupDebugMode() {
  // Expor globalmente para debugging
  window.DEBUG = {
    log: debugLog,
    error: debugError,
    checkElement: (id) => {
      const el = document.getElementById(id);
      console.log(`Element #${id}:`, el ? '✓ Encontrado' : '✗ Não encontrado', el);
      return el;
    },
    checkFunction: (name, obj) => {
      const fn = obj[name];
      console.log(`Function ${name}:`, typeof fn === 'function' ? '✓ Definida' : '✗ Não definida');
      return fn;
    },
    state: () => {
      console.log('Current State:', window.state || 'Não inicializado');
    }
  };

  console.log('%cDEBUG MODE ATIVADO', 'color: #00D084; font-size: 16px; font-weight: bold;');
  console.log('Use: DEBUG.log("component", "message", data)');
  console.log('Use: DEBUG.checkElement("elementId")');
}
