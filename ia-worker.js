// Ejecuta el modelo en un hilo aparte para que la interfaz no se congele.
import { WebWorkerMLCEngineHandler } from './vendor/web-llm.js';
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = msg => handler.onmessage(msg);
