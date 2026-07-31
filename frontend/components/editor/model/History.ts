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
export class History {
    private undoStack: HistoryCommand[] = [];
    private redoStack: HistoryCommand[] = [];

    push(command: HistoryCommand): void {
        this.undoStack.push(command);
        this.redoStack = [];
    }

    undo(): boolean {
        const command = this.undoStack.pop();

        if (!command) {
            return false;
        }

        command.undo();
        this.redoStack.push(command);
        return true;
    }

    redo(): boolean {
        const command = this.redoStack.pop();

        if (!command) {
            return false;
        }

        command.redo();
        this.undoStack.push(command);
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
    }
}
