## OBSIDIAN OCR PROJECT

Here's the goal: We're gonna allow the user to use the obsidian app to take / upload photos and scans of their notebooks. Then, we'll use an LLM / OCR model to parse their notes, label them, tag them, name them, and organize them. The user should be able to dump 100 photos and have this process run on their machine.

### UPLOADING PHOTOS

Ideally, the user can scan their notebook directly from the app, but if it makes more sense to just have them upload photos as an mvp, we can do that.

### PARSING PHOTOS

This part is tricky, and you'll have to answer some questions for it. Do we A) Handle the parsing logic locally in the plugin, just making requests out to llm apis like OpenAI or Anthropic?, or do we B) Send these images off to a separate service we run that takes the photos, runs the llm requests, and generates the actual notes, then allowing the obsidian plugin to sync up with the external service and pull those new files?
