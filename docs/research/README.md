# RADAR feature catalogue and research roadmap

**27 October 2026 · Planning version 1.0 · 35-page PDF**

[Download the PDF](RADAR-Feature-Catalogue-and-Research-Roadmap.pdf) · [Editable Markdown](RADAR-Feature-Catalogue-and-Research-Roadmap.md) · [Machine-readable catalogue](feature-catalogue.json)

The document covers **84 current feature families** and **64 proposed additions**, with separate labels for code that exists, integrations needing activation, real data/assets still required, experimental workflows and unimplemented proposals.

Current catalogue labels: 64 Built, 9 Activation, 7 Data needed, 4 Experimental. “Built” means code exists; it does not mean independently certified, field-validated or deployed. The 64 proposals are documented research ideas, not software delivered by this documentation commit.

The PDF includes method comparisons, a hybrid architecture diagram, study objectives, baseline/ablation design, annotation and split protocols, metrics, accessibility/usability tasks, configuration prerequisites, a phased roadmap, risks and reference pointers. GIS and CNNs are treated as complementary tools rather than interchangeable competitors. No safety benefit or model superiority is guaranteed.

Audited application baseline: `44d511f`; main merge `2f5f72d`. The document records the existing test evidence (87 automated tests; 36 embedded-PostgreSQL feature checks) without claiming new live provider, hosted deployment, physical-device or model-accuracy verification. No application feature was implemented as part of producing this PDF.

Optional regeneration from the repository root:

```sh
python3 scripts/build-research-roadmap.py
```

Rebuilding needs the document-only `reportlab` Python package and DejaVu Sans fonts at `/usr/share/fonts/truetype/dejavu`. Python is **not** required to run RADAR or read the generated PDF. Edit the catalogue JSON for feature entries and the builder for the planning narrative. The generated Markdown can also be edited independently for a study handoff; such edits do not feed the PDF builder automatically.

The references are canonical starting points and official documentation links, not a claim of a systematic literature review or current live endpoint verification. Institutional/school approval, suitable datasets, trained weights, compute and acceptance evidence remain prerequisites for the proposed work.
