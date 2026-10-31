# Embedded third-party attribution and provenance

Scope: `platform.third-party-attribution`; web legal assets, source notices,
and Electron ASAR inspection. This is an engineering record, not a legal
opinion or a certificate that all project material is independently authored.
The user confirms ownership of `voo-canvas-core`; it is not a disputed source.

## Corrected OpenPencil source

The former link to `ZSeven-W/openpencil` identified a different project. The
schema matches `open-pencil/open-pencil` at
`f5bd2425b6491be58b43c398ac1343e4d8249fe6`, path
`packages/kiwi/src/fig/schema/fig.kiwi`. All 605 definitions match, including
names, order, field types, tags and array flags. The 68,800-byte binary SHA-256
is `8df57261637ee079f4802d32cd97b5fb3cee40234cea6876abfb8d2adcbe6f74`.
The comparison and upstream retrieval evidence are retained locally under
`/private/tmp/voo-license-upstream/`; product data is unchanged.

The matching revision's complete MIT license identifies Danila Poyarkov.
It is preserved in `scripts/license-texts/openpencil.txt`; existing generic
OpenPencil attribution is also retained in `NOTICE`. The adapter's in-memory
`nodeChangeOrder` addition is documented separately from the upstream schema.
No upstream decoder is claimed as included by this entry.

## OpenDesign guidance

The source already marks adapted guidance in `layout_skills_data.js`.
The root `skills/` copy and Apache-2.0 license were reviewed at
`12d970eacc8971150e3c76470d2a9afe16dc2ed1`; the complete root license is
preserved in `scripts/license-texts/opendesign.txt`. VOO's condensation,
dimensions, example and constraint changes are explicitly recorded.
The separately published plugin manifest declares MIT; this is not used to
relicense all material from the repository. This notice references the root
`skills/` copy. No root NOTICE was present at the reviewed revision.

The original import revision is still unknown. The manifest explicitly calls
the pinned revision a review reference rather than inventing historical
provenance. Other unrelated templates or their dependencies are not covered
by this entry. Recovering the original import record remains open.

## Distribution contract and regression evidence

| Context | Contract and evidence |
| --- | --- |
| Missing notices reproduction | The new embedded-component assertion failed before the generator change; `/private/tmp/voo-license-regression/before.log` |
| Source distribution | Root NOTICE identifies scope, modifications and license files; source comments retain attribution |
| Generated web assets | The generator includes both embedded components in THIRD_PARTY_NOTICES.json and copies NOTICE; missing/empty license text fails the build |
| Schema replacement | Unit test checks the decoded schema hash against the attributed component, requiring a new review when data changes |
| ASAR | Real fixture archives must include root/dist NOTICE and complete embedded license entries; missing entries are rejected |
| Built web editor | `editor-resources-built` fetches legal assets and checks attribution/full-license markers before exercising template insertion and undo |
| About UI | Existing Third Party Notices loads the generated JSON; no additional default UI control is introduced |

Targeted tests: 33 passed in the isolated checkout before full release
verification; evidence `/private/tmp/voo-license-regression/isolated-after.log`.
Final clean revision, release results and deployment evidence are maintained
in `../quality-progress.md`; do not treat these targeted checks as full-platform
or signed-installer acceptance.

## Remaining historical review

Pen and Figma extraction records and previously published copies are retained
as evidence. Removing a directory from current Git tracking does not remove
history or resolve past distribution/service-term questions. Do not erase
records or rename references to imply an independent implementation.

Current official reference terms:

- https://www.figma.com/legal/tos/ — section 2.2, effective March 11, 2026.
- https://www.pen.dev/eula — section 3, effective October 15, 2026.

For a legal review, collect the accepted terms/version, authorization, analysis
dates, application versions, extracted artifacts, access method, distribution
history and applicable jurisdiction. Assess any interoperability/statutory
exception separately. No new proprietary application extraction was performed
in this repair, and no claim is made that adding notices cures historical
service-term issues or establishes ownership of third-party material.
