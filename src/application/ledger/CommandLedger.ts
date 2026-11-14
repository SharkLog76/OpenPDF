/**
 * Deterministic Command Ledger (Undo / Redo) for full non-destructive PDF editing.
 * Maintains bounded history and guarantees invariant preservation (e.g. minimum 1 page).
 */
import type { DomainError } from '../../contracts/errors.ts';
import { ADMISSION_LIMITS } from '../../contracts/schemas.ts';
import type { EditCommand, EditorDocumentState, PageTransformState } from '../../domain/editor.ts';
import { err, ok, type Result } from '../../domain/result.ts';

export function createInitialEditorState(
  pageCount: number,
  initialFormValues: Readonly<Record<string, string | boolean>> = {}
): EditorDocumentState {
  const pages: PageTransformState[] = Array.from({ length: pageCount }, (_, i) => ({
    uid: `p-orig-${i}`,
    kind: 'source',
    sourceDocIndex: 0,
    sourcePageIndex: i,
    addedRotation: 0,
  }));
  return {
    pages,
    texts: [],
    existingTextEdits: {},
    annotations: [],
    images: [],
    whiteouts: [],
    links: [],
    createdFormFields: [],
    watermark: null,
    headerFooter: null,
    pageCrop: null,
    pageBackground: null,
    formValues: { ...initialFormValues },
  };
}

function applySingleCommand(state: EditorDocumentState, cmd: EditCommand): EditorDocumentState {
  switch (cmd.type) {
    case 'ADD_TEXT':
      return { ...state, texts: [...state.texts, cmd.item] };
    case 'UPDATE_TEXT':
      return {
        ...state,
        texts: state.texts.map((t) => (t.id === cmd.id ? cmd.next : t)),
      };
    case 'DELETE_TEXT':
      return {
        ...state,
        texts: state.texts.filter((t) => t.id !== cmd.item.id),
      };
    case 'UPSERT_EXISTING_TEXT_EDIT': {
      const nextMap = { ...state.existingTextEdits, [cmd.next.key]: cmd.next };
      return { ...state, existingTextEdits: nextMap };
    }
    case 'ADD_ANNOTATION':
      return { ...state, annotations: [...state.annotations, cmd.item] };
    case 'DELETE_ANNOTATION':
      return {
        ...state,
        annotations: state.annotations.filter((a) => a.id !== cmd.item.id),
      };
    case 'INSERT_IMAGE':
      return { ...state, images: [...state.images, cmd.item] };
    case 'UPDATE_IMAGE_RECT':
      return {
        ...state,
        images: state.images.map((im) => (im.id === cmd.id ? { ...im, rect: cmd.nextRect } : im)),
      };
    case 'DELETE_IMAGE':
      return {
        ...state,
        images: state.images.filter((im) => im.id !== cmd.item.id),
      };
    case 'ADD_WHITEOUT':
      return { ...state, whiteouts: [...state.whiteouts, cmd.item] };
    case 'DELETE_WHITEOUT':
      return { ...state, whiteouts: state.whiteouts.filter((w) => w.id !== cmd.item.id) };
    case 'ADD_LINK':
      return { ...state, links: [...state.links, cmd.item] };
    case 'DELETE_LINK':
      return { ...state, links: state.links.filter((l) => l.id !== cmd.item.id) };
    case 'CREATE_FORM_FIELD':
      return {
        ...state,
        createdFormFields: [...state.createdFormFields, cmd.item],
        formValues: { ...state.formValues, [cmd.item.fieldName]: cmd.item.defaultValue },
      };
    case 'DELETE_FORM_FIELD':
      return {
        ...state,
        createdFormFields: state.createdFormFields.filter((f) => f.id !== cmd.item.id),
      };
    case 'SET_WATERMARK':
      return { ...state, watermark: cmd.next };
    case 'SET_HEADER_FOOTER':
      return { ...state, headerFooter: cmd.next };
    case 'SET_PAGE_CROP':
      return { ...state, pageCrop: cmd.next };
    case 'SET_PAGE_BACKGROUND':
      return { ...state, pageBackground: cmd.next };
    case 'ROTATE_PAGE':
      return {
        ...state,
        pages: state.pages.map((p) =>
          p.uid === cmd.pageUid
            ? { ...p, addedRotation: (((p.addedRotation + cmd.delta) % 360) as PageTransformState['addedRotation']) }
            : p
        ),
      };
    case 'DELETE_PAGE':
      return {
        ...state,
        pages: state.pages.filter((p) => p.uid !== cmd.pageUid),
      };
    case 'DUPLICATE_PAGE': {
      const idx = state.pages.findIndex((p) => p.uid === cmd.afterPageUid);
      const next = [...state.pages];
      next.splice(idx >= 0 ? idx + 1 : next.length, 0, cmd.created);
      return { ...state, pages: next };
    }
    case 'INSERT_BLANK_PAGE': {
      const next = [...state.pages];
      const targetIdx = Math.min(Math.max(0, cmd.insertAtIndex), next.length);
      next.splice(targetIdx, 0, cmd.created);
      return { ...state, pages: next };
    }
    case 'REORDER_PAGES':
      return { ...state, pages: [...cmd.nextOrder] };
    case 'SET_FORM_FIELD':
      return {
        ...state,
        formValues: { ...state.formValues, [cmd.fieldName]: cmd.nextValue },
      };
  }
}

function invertCommand(cmd: EditCommand): EditCommand {
  switch (cmd.type) {
    case 'ADD_TEXT':
      return { type: 'DELETE_TEXT', item: cmd.item };
    case 'UPDATE_TEXT':
      return { type: 'UPDATE_TEXT', id: cmd.id, previous: cmd.next, next: cmd.previous };
    case 'DELETE_TEXT':
      return { type: 'ADD_TEXT', item: cmd.item };
    case 'UPSERT_EXISTING_TEXT_EDIT':
      return {
        type: 'UPSERT_EXISTING_TEXT_EDIT',
        previous: cmd.next,
        next: cmd.previous ?? { ...cmd.next, currentText: cmd.next.originalText, currentRect: cmd.next.originalRect, deleted: false },
      };
    case 'ADD_ANNOTATION':
      return { type: 'DELETE_ANNOTATION', item: cmd.item };
    case 'DELETE_ANNOTATION':
      return { type: 'ADD_ANNOTATION', item: cmd.item };
    case 'INSERT_IMAGE':
      return { type: 'DELETE_IMAGE', item: cmd.item };
    case 'UPDATE_IMAGE_RECT':
      return { type: 'UPDATE_IMAGE_RECT', id: cmd.id, previousRect: cmd.nextRect, nextRect: cmd.previousRect };
    case 'DELETE_IMAGE':
      return { type: 'INSERT_IMAGE', item: cmd.item };
    case 'ADD_WHITEOUT':
      return { type: 'DELETE_WHITEOUT', item: cmd.item };
    case 'DELETE_WHITEOUT':
      return { type: 'ADD_WHITEOUT', item: cmd.item };
    case 'ADD_LINK':
      return { type: 'DELETE_LINK', item: cmd.item };
    case 'DELETE_LINK':
      return { type: 'ADD_LINK', item: cmd.item };
    case 'CREATE_FORM_FIELD':
      return { type: 'DELETE_FORM_FIELD', item: cmd.item };
    case 'DELETE_FORM_FIELD':
      return { type: 'CREATE_FORM_FIELD', item: cmd.item };
    case 'SET_WATERMARK':
      return { type: 'SET_WATERMARK', previous: cmd.next, next: cmd.previous };
    case 'SET_HEADER_FOOTER':
      return { type: 'SET_HEADER_FOOTER', previous: cmd.next, next: cmd.previous };
    case 'SET_PAGE_CROP':
      return { type: 'SET_PAGE_CROP', previous: cmd.next, next: cmd.previous };
    case 'SET_PAGE_BACKGROUND':
      return { type: 'SET_PAGE_BACKGROUND', previous: cmd.next, next: cmd.previous };
    case 'ROTATE_PAGE':
      return {
        type: 'ROTATE_PAGE',
        pageUid: cmd.pageUid,
        delta: (((360 - cmd.delta) % 360) as PageTransformState['addedRotation']),
      };
    case 'DELETE_PAGE':
      return {
        type: 'DUPLICATE_PAGE',
        afterPageUid: '__restore__',
        created: cmd.snapshot,
      };
    case 'DUPLICATE_PAGE':
    case 'INSERT_BLANK_PAGE':
      return {
        type: 'DELETE_PAGE',
        pageUid: cmd.created.uid,
        removedIndex: -1,
        snapshot: cmd.created,
      };
    case 'REORDER_PAGES':
      return { type: 'REORDER_PAGES', previousOrder: cmd.nextOrder, nextOrder: cmd.previousOrder };
    case 'SET_FORM_FIELD':
      return {
        type: 'SET_FORM_FIELD',
        fieldName: cmd.fieldName,
        previousValue: cmd.nextValue,
        nextValue: cmd.previousValue,
      };
  }
}

export interface CommandLedgerSnapshot {
  readonly undoStack: readonly EditCommand[];
  readonly redoStack: readonly EditCommand[];
  readonly state: EditorDocumentState;
  readonly revision: number;
}

export class CommandLedger {
  private undoStack: EditCommand[] = [];
  private redoStack: EditCommand[] = [];
  private state: EditorDocumentState;
  private revision = 0;

  constructor(initialState: EditorDocumentState) {
    this.state = initialState;
  }

  static fromSnapshot(snapshot: CommandLedgerSnapshot): CommandLedger {
    const ledger = new CommandLedger(snapshot.state);
    ledger.undoStack = [...snapshot.undoStack];
    ledger.redoStack = [...snapshot.redoStack];
    ledger.revision = snapshot.revision;
    return ledger;
  }

  exportSnapshot(): CommandLedgerSnapshot {
    return {
      undoStack: [...this.undoStack],
      redoStack: [...this.redoStack],
      state: this.state,
      revision: this.revision,
    };
  }

  get currentState(): EditorDocumentState {
    return this.state;
  }

  get currentRevision(): number {
    return this.revision;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get commandCount(): number {
    return this.undoStack.length;
  }

  apply(command: EditCommand): Result<EditorDocumentState, DomainError> {
    if (command.type === 'DELETE_PAGE' && this.state.pages.length <= 1) {
      return err({
        code: 'CannotDeleteLastPage',
        message: 'Impossible de supprimer la dernière page restante du document.',
      });
    }

    this.state = applySingleCommand(this.state, command);
    this.undoStack.push(command);
    if (this.undoStack.length > ADMISSION_LIMITS.MAX_LEDGER_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.revision++;
    return ok(this.state);
  }

  undo(): EditorDocumentState | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;

    if (cmd.type === 'DELETE_PAGE') {
      const restored = [...this.state.pages];
      restored.splice(Math.min(cmd.removedIndex, restored.length), 0, cmd.snapshot);
      this.state = { ...this.state, pages: restored };
    } else if (cmd.type === 'UPSERT_EXISTING_TEXT_EDIT' && cmd.previous === null) {
      const nextMap = { ...this.state.existingTextEdits };
      delete nextMap[cmd.next.key];
      this.state = { ...this.state, existingTextEdits: nextMap };
    } else {
      this.state = applySingleCommand(this.state, invertCommand(cmd));
    }

    this.redoStack.push(cmd);
    this.revision++;
    return this.state;
  }

  redo(): EditorDocumentState | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    this.state = applySingleCommand(this.state, cmd);
    this.undoStack.push(cmd);
    this.revision++;
    return this.state;
  }
}
