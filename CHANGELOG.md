# Changelog

All notable changes to this plugin will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

## [1.2.10] - 2026-05-07
### Fixed
- Versa Maintenance Contracts skill: Step 3 merger now detects source values dynamically from the template instead of relying on Wimbledon Park reference values being present. Prevents silent leakage of a previous customer's details when the most recent Versa Maintenance Contract.docx on the connector belongs to a different customer.
