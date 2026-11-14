import { describe, expect, it } from 'vitest';
import {
  computeNextActiveTabAfterClose,
  deserializeDetachedTabState,
  evaluateTabClosePolicy,
  evaluateWindowClosePolicy,
  isDragDetachTriggered,
  parseExternalOpenPreference,
  reorderTabs,
  serializeDetachedTabState,
} from '../src/domain/workspaceTabs.ts';

describe('shell/multi-tab-and-close-lifecycle — Tab Reorder, Detach & Close Policies', () => {
  it('réordonne les onglets de manière immuable et borne les indices', () => {
    const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    expect(reorderTabs(tabs, 'a', 2).map((t) => t.id)).toEqual(['b', 'c', 'a']);
    expect(reorderTabs(tabs, 'c', 0).map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(reorderTabs(tabs, 'b', 99).map((t) => t.id)).toEqual(['a', 'c', 'b']);
    expect(reorderTabs(tabs, 'missing', 1).map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(tabs.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('sélectionne le prochain onglet actif après fermeture', () => {
    const tabs = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];

    expect(computeNextActiveTabAfterClose(tabs, 't1', 't3')).toBe('t3');
    expect(computeNextActiveTabAfterClose(tabs, 't2', 't2')).toBe('t3');
    expect(computeNextActiveTabAfterClose(tabs, 't3', 't3')).toBe('t2');
    expect(computeNextActiveTabAfterClose([{ id: 'only' }], 'only', 'only')).toBeNull();
  });

  it('évalue la politique de fermeture d’un onglet unique selon l’état dirty', () => {
    expect(
      evaluateTabClosePolicy({ id: 't1', fileName: 'propre.pdf', isDirty: false })
    ).toEqual({
      action: 'close-immediately',
      dirtyTabs: [],
    });

    expect(
      evaluateTabClosePolicy({ id: 't2', fileName: 'modifie.pdf', isDirty: true })
    ).toEqual({
      action: 'prompt-save',
      dirtyTabs: [{ id: 't2', fileName: 'modifie.pdf', isDirty: true }],
    });
  });

  it('intercepte la fermeture fenêtre si onglets modifiés ou plusieurs onglets ouverts', () => {
    expect(evaluateWindowClosePolicy([])).toMatchObject({
      shouldIntercept: false,
      hasDirtyTabs: false,
      isMultiTab: false,
      tabCount: 0,
    });

    expect(
      evaluateWindowClosePolicy([{ id: 't1', fileName: 'a.pdf', isDirty: false }])
    ).toMatchObject({
      shouldIntercept: false,
      hasDirtyTabs: false,
      isMultiTab: false,
      tabCount: 1,
    });

    expect(
      evaluateWindowClosePolicy([
        { id: 't1', fileName: 'a.pdf', isDirty: false },
        { id: 't2', fileName: 'b.pdf', isDirty: false },
      ])
    ).toMatchObject({
      shouldIntercept: true,
      hasDirtyTabs: false,
      isMultiTab: true,
      tabCount: 2,
      dirtyTabs: [],
    });

    const multiDirty = evaluateWindowClosePolicy([
      { id: 't1', fileName: 'a.pdf', isDirty: true },
      { id: 't2', fileName: 'b.pdf', isDirty: false },
    ]);
    expect(multiDirty.shouldIntercept).toBe(true);
    expect(multiDirty.hasDirtyTabs).toBe(true);
    expect(multiDirty.isMultiTab).toBe(true);
    expect(multiDirty.dirtyTabs.map((d) => d.fileName)).toEqual(['a.pdf']);
  });

  it('déclenche le détachement uniquement avec >= 2 onglets hors zone fenêtre/barre', () => {
    expect(
      isDragDetachTriggered({
        tabsCount: 1,
        clientX: 300,
        clientY: -60,
        viewportWidth: 1200,
        viewportHeight: 800,
      })
    ).toBe(false);

    expect(
      isDragDetachTriggered({
        tabsCount: 2,
        clientX: 400,
        clientY: 75,
        viewportWidth: 1200,
        viewportHeight: 800,
      })
    ).toBe(false);

    expect(
      isDragDetachTriggered({
        tabsCount: 2,
        clientX: 400,
        clientY: -35,
        viewportWidth: 1200,
        viewportHeight: 800,
      })
    ).toBe(true);

    expect(
      isDragDetachTriggered({
        tabsCount: 2,
        clientX: 400,
        clientY: 180,
        viewportWidth: 1200,
        viewportHeight: 800,
      })
    ).toBe(true);

    expect(
      isDragDetachTriggered({
        tabsCount: 2,
        clientX: 1260,
        clientY: 50,
        viewportWidth: 1200,
        viewportHeight: 800,
      })
    ).toBe(true);
  });

  it('sérialise et restaure sans perte les Uint8Array d’état lors du détachement d’onglet', () => {
    const sample = {
      currentPage: 2,
      zoom: 1.25,
      embeddedImage: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      nested: [{ label: 'Cachet', bytes: new Uint8Array([1, 2, 3, 255]) }],
    };

    const json = serializeDetachedTabState(sample);
    const restored = deserializeDetachedTabState<typeof sample>(json);

    expect(restored).not.toBeNull();
    expect(restored!.currentPage).toBe(2);
    expect(restored!.embeddedImage).toBeInstanceOf(Uint8Array);
    expect(Array.from(restored!.embeddedImage)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(restored!.nested[0].bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(restored!.nested[0].bytes)).toEqual([1, 2, 3, 255]);

    expect(deserializeDetachedTabState('{invalid json')).toBeNull();
  });

  it('valide les préférences d’ouverture externe', () => {
    expect(parseExternalOpenPreference('current-window')).toBe('current-window');
    expect(parseExternalOpenPreference('new-window')).toBe('new-window');
    expect(parseExternalOpenPreference('ask')).toBe('ask');
    expect(parseExternalOpenPreference('unknown')).toBe('ask');
    expect(parseExternalOpenPreference(null)).toBe('ask');
  });
});
