export type HistoryCommand = {
    label?: string;
    undo: () => void;
    redo: () => void;
};

/**
 * Pila de deshacer/rehacer del editor. No conoce el modelo ni Pixi: quien
 * arma cada comando ya aplico la mutacion y es responsable de que `undo`/
 * `redo` dejen el modelo y la escena consistentes (restaurar tiles, marcar
 * chunks sucios, etc.).
 */
const MAX_UNDO_COMMANDS = 200;

export class History {
    private undoStack: HistoryCommand[] = [];
    private redoStack: HistoryCommand[] = [];

    private listeners = new Set<() => void>();

    /** Avisa cuando cambia lo que se puede deshacer o rehacer. Devuelve como desuscribirse. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }

    push(command: HistoryCommand): void {
        this.undoStack.push(command);
        this.redoStack = [];

        // Cada comando retiene copias de los tiles que toco; una sesion larga
        // pintando regiones grandes acumularia el mapa entero varias veces.
        if (this.undoStack.length > MAX_UNDO_COMMANDS) {
            this.undoStack.splice(0, this.undoStack.length - MAX_UNDO_COMMANDS);
        }

        this.notify();
    }

    undo(): boolean {
        const command = this.undoStack.pop();

        if (!command) {
            return false;
        }

        command.undo();
        this.redoStack.push(command);
        this.notify();
        return true;
    }

    redo(): boolean {
        const command = this.redoStack.pop();

        if (!command) {
            return false;
        }

        command.redo();
        this.undoStack.push(command);
        this.notify();
        return true;
    }

    get canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    get canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.notify();
    }
}
