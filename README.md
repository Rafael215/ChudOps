# ChudOps

A digital twin of Southern California's solar grid 
that predicts which installations are most at risk 
during an earthquake — and proves its own cloud 
infrastructure can survive the same disaster.

Built at DataHacks UCSD 2025. First place, 
Cloud Development track.

---

## What It Does

You pick an earthquake scenario. Bedrock scores every 
solar installation in Southern California with a 
probability of failure and lights them up red, yellow, 
or green on a live map. It also tells you how much 
capacity is at risk and which sites to prioritize.

As a bonus: the system can simulate a regional cloud 
outage and automatically recover — because in a real 
disaster, the monitoring system is just as likely to 
fail as the infrastructure it's watching.

---

## The Data

We combined two real datasets that were never designed 
to talk to each other:

- **Scripps Institution of Oceanography** — 
  physics-based earthquake simulations that map 
  ground shaking intensity across Southern California
- **ZenPower** — actual permitted solar installation 
  records with real GPS coordinates and system 
  capacities

---

## The Model

An XGBoost classifier that scores each solar site 
using three inputs: how hard the ground shook at 
that location, what type of installation it is 
(rooftop vs ground-mount), and what the soil is 
like underneath it. Soft soil amplifies shaking 
significantly compared to bedrock.

Damage probabilities are calibrated against FEMA 
HAZUS fragility curves — the same engineering 
standard the U.S. government uses for disaster 
loss estimation.

---

## The Stack

Frontend: React, Vite, TypeScript, Tailwind, Mapbox

Backend: AWS CDK, API Gateway, Lambda, DynamoDB, 
SageMaker, AppSync, CloudFront, S3

ML: Python, scikit-learn, XGBoost

---

## Running It Locally

You will need Node.js, Python 3, and your own AWS 
account with credentials configured.

```bash
# Install dependencies
npm install

# Copy environment placeholders
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local

# Start the dashboard locally
npm run dev
```

For ML training:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/ml/requirements.txt
python services/ml/src/train.py \
  --sites-csv data/processed/sites.csv \
  --features-csv data/processed/scenario_features.csv \
  --output-dir outputs/model
```

---

## Project Structure

apps/web        Dashboard (React)

infra           AWS infrastructure (CDK)

services/api    Backend Lambda functions

services/ml     ML training and inference

data            Datasets and processed CSVs

docs            Architecture notes

---

## Notes

The live deployment is offline after the hackathon 
to avoid ongoing AWS costs. Everything you need to 
run it yourself is in this repo.

Synthetic training labels were generated from FEMA 
HAZUS fragility curves because real post-earthquake 
solar failure data at this resolution does not exist.

---

## Built By

Rafael Lopez and Jordan Valerio  
DataHacks UCSD 2026
