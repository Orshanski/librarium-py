"""Создать минимальный валидный EPUB файл для тестов."""
import zipfile
from pathlib import Path

OUTPUT = Path(__file__).parent / "books" / "minimal.epub"

MIMETYPE = "application/epub+zip"

CONTAINER_XML = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""

CONTENT_OPF = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">test-epub-001</dc:identifier>
    <dc:title>EPUB Test Book</dc:title>
    <dc:creator>EPUB Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:subject>Science Fiction</dc:subject>
    <dc:publisher>EPUB Press</dc:publisher>
    <dc:date>2025</dc:date>
    <meta property="dcterms:modified">2025-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>"""

CHAPTER_XHTML = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body><p>Test EPUB content.</p></body>
</html>"""

NAV_XHTML = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title></head>
<body>
<nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter 1</a></li></ol></nav>
</body>
</html>"""

with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_STORED) as zf:
    zf.writestr("mimetype", MIMETYPE)
    zf.writestr("META-INF/container.xml", CONTAINER_XML)
    zf.writestr("content.opf", CONTENT_OPF)
    zf.writestr("chapter.xhtml", CHAPTER_XHTML)
    zf.writestr("nav.xhtml", NAV_XHTML)

print(f"Created {OUTPUT}")
