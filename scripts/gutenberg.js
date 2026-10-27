/** Removes the Project Gutenberg licence header and footer, which are not part of the work. */
export function stripGutenberg(t){
  const s=t.replace(/\r/g,''),a=/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i.exec(s),b=/\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.exec(s);
  return s.slice(a?a.index+a[0].length:0,b?b.index:s.length).trim();
}
