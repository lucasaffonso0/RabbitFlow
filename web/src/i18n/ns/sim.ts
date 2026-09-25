import { defineMessages } from '../define';

// Passo a passo da simulação de roteamento
export default defineMessages({
  'pt-BR': {
    'sim.cycle': '↺ {name} já visitada (ciclo), ignorando',
    'sim.defaultToQueue': '(default) → queue {queue}',
    'sim.defaultNoQueue': '(default): nenhuma queue chamada "{key}"',
    'sim.exchangeMissing': 'exchange {name} não existe',
    'sim.matched': '{name} [{type}]: {n} binding casou|{name} [{type}]: {n} bindings casaram',
    'sim.toAlternate': '→ alternate-exchange {name}',
    'sim.toQueue': '→ queue {name}',
    'sim.toExchange': '→ exchange {name}',
  },
  en: {
    'sim.cycle': '↺ {name} already visited (cycle), skipping',
    'sim.defaultToQueue': '(default) → queue {queue}',
    'sim.defaultNoQueue': '(default): no queue named "{key}"',
    'sim.exchangeMissing': 'exchange {name} does not exist',
    'sim.matched': '{name} [{type}]: {n} binding matched|{name} [{type}]: {n} bindings matched',
    'sim.toAlternate': '→ alternate exchange {name}',
    'sim.toQueue': '→ queue {name}',
    'sim.toExchange': '→ exchange {name}',
  },
  es: {
    'sim.cycle': '↺ {name} ya visitada (ciclo), se omite',
    'sim.defaultToQueue': '(default) → queue {queue}',
    'sim.defaultNoQueue': '(default): ninguna queue llamada "{key}"',
    'sim.exchangeMissing': 'la exchange {name} no existe',
    'sim.matched': '{name} [{type}]: {n} binding coincidió|{name} [{type}]: {n} bindings coincidieron',
    'sim.toAlternate': '→ alternate exchange {name}',
    'sim.toQueue': '→ queue {name}',
    'sim.toExchange': '→ exchange {name}',
  },
});
