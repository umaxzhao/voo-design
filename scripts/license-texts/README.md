ONNX Runtime's published npm packages omit the root license. `onnxruntime.txt`
was retrieved from https://raw.githubusercontent.com/microsoft/onnxruntime/v1.30.0/LICENSE.
`ISC.txt` supplements guid-typescript's declared ISC license with standard terms
and author attribution from its package metadata. lazy-val similarly declares MIT
without shipping a license file; the generator labels its standard MIT supplement.
Review these supplements when upgrading the corresponding dependencies.

Embedded components are listed in `../bundled-third-party-notices.mjs`.
`openpencil.txt` is the unmodified MIT license from open-pencil/open-pencil
at f5bd2425b6491be58b43c398ac1343e4d8249fe6, the revision matching all 605
bundled schema definitions. `opendesign.txt` is the unmodified Apache-2.0
license from nexu-io/open-design at 12d970eacc8971150e3c76470d2a9afe16dc2ed1
(trailing blank lines normalized; license wording unchanged).
That revision is a license review reference, not an asserted original import.
See the root NOTICE for scope, modifications and provenance limits.
