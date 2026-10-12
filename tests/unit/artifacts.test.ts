import { describe, expect, it } from 'vitest';
import { injectResizeScript, RESIZE_SCRIPT } from '@/lib/artifacts';

describe('injectResizeScript', () => {
  it('inserts the script just before </body>', () => {
    const out = injectResizeScript('<html><body><p>x</p></BODY></html>');
    expect(out).toBe(`<html><body><p>x</p>${RESIZE_SCRIPT}\n</BODY></html>`);
  });

  it('appends the script when there is no </body>', () => {
    expect(injectResizeScript('<p>fragment</p>')).toBe(`<p>fragment</p>\n${RESIZE_SCRIPT}\n`);
  });

  it('posts the artifact:height message to the parent', () => {
    expect(RESIZE_SCRIPT).toContain("parent.postMessage({type:'artifact:height',height:v},'*')");
  });
});
