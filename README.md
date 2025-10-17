# F5 XC Forensic Toolkit 🕵️‍♂️
A command-line toolkit for rapid triage and forensic analysis of F5 Distributed Cloud (XC) security events.
Leverage aggregation APIs to find top threats and perform drill-down investigations without downloading the entire haystack of logs.

Tired of drowning in security logs? Want to find the needle without downloading the entire haystack? This tool is for you!

It's a simple Node.js script that uses F5 Distributed Cloud (XC) aggregation APIs to perform quick security event analysis. Instead of pulling gigabytes of raw logs, you can work with top-K numbers, get quick summaries, and drill down into the data that actually matters.

## ✨ Core Features

  * **Log-Lite Analysis**: Uses server-side aggregations to get insights without fetching every single log entry.
  * **Simple Query Templates**: Write your queries in clean, easy-to-read JSON files. No more escaping a million characters in a one-liner.
  * **Powerful Drill-Down**: Perform two-step analyses similar to a `GROUP BY` in SQL. Find the top attackers, then see what they did.
  * **Flexible & Configurable**: Easily manage tenants, namespaces, IP exemption lists, and more in a central `config.json` file.
  * **Smart Query Operators**: Supports `=`, `!=`, `=~` (regex) for precise filtering.

-----

## 🚀 Getting Started

### Prerequisites

  * **Node.js** (v16 or higher recommended)
  * **npm** (usually comes with Node.js)
  * An **F5 Distributed Cloud API Token**

### Installation & Setup

1.  **Clone the Repository**

    ```bash
    git clone https://github.com/kayvanx/xc-forensic-toolkit/
    cd xc-forensic-toolkit
    ```

2.  **Install Dependencies**

    ```bash
    npm install
    ```

3.  **Configure the Tool**

      * Rename `config.example.json` to `config.json`.
      * Open `config.json` and fill in your details.

-----

## ⚙️ The `config.json` File

This is the control center for the script. Here’s what each setting does:

```json
{
  "_comment1": "Set the tenant URL. This is the main domain for your F5 XC console.",
  "TENANT_URL": "your-tenant.console.ves.volterra.io",

  "_comment2": "URL templates. The script will automatically insert your TENANT_URL and NAMESPACE.",
  "API_AGGREGATION_URL_TEMPLATE": "https://{TENANT_URL}/api/data/namespaces/{NAMESPACE}/app_security/events/aggregation",
  "API_EVENTS_URL_TEMPLATE": "https://{TENANT_URL}/api/data/namespaces/{NAMESPACE}/app_security/events",

  "_comment3": "Set the default namespace. Use 'system' for tenancy-wide searches.",
  "NAMESPACE": "system",

  "_comment4": "Your F5 XC API Token. Keep this safe! The recommended role is 'ves-io-monitor-role' on the system and relevant app namespaces.",
  "API_TOKEN": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=",

  "_comment5": "Optionally define an LB name to construct a VH_NAME variable for your queries.",
  "LB_NAME": "my-app-lb",
  "VH_NAME_TEMPLATE": "ves-io-http-loadbalancer-${LB_NAME}",

  "_comment6": "Maximum number of values (e.g., IPs) to use in a drill-down (Group By) query.",
  "MAX_DRILLDOWN_VALUES": 100,

  "//": "List of trusted IPs/subnets to exclude from analysis. Critical for accurate Malicious User Detection (MUD) PoVs.",
  "EXEMPT_SUBNETS": [
    "100.64.0.0/10",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16"
  ]
}
```

-----

## 🧑‍💻 How to Use the Script

The script is run from your terminal with a simple command structure.

### Command Structure

```bash
node run_query.js <path/to/query.json> [time_option] [workflow_option]
```

**Arguments:**

  * **`<path/to/query.json>`** (Required): The path to your query file. You can use tab-autocomplete\!
  * **`[time_option]`** (Optional):
      * `--relative <value>`: Use a relative time (e.g., `5m`, `1h`, `3d`).
      * `--absolute <start> <end>`: Use an exact ISO 8601 time window.
      * Defaults to the last 15 minutes if omitted.
  * **`[workflow_option]`** (Optional):
      * `--drill-down <FIELD> <path/to/second_query.json>`: Performs a two-step analysis. `<FIELD>` is the key to extract from the first query's results (e.g., `SRC_IP`).

### Example Use Cases

#### Use Case 1: Calculate MUD/MUM Impact (Drill-Down)

This workflow first finds the top malicious IPs and then counts the actions from other security controls associated with them. This is great for showing how Malicious User Mitigation (MUM) enhances WAF, Rate Limit, Bot and etc.

1.  **First Query (`./queries/step1_get_top_malicious_ips.json`)**: Finds top `SRC_IP` with `malicious_user_sec_event`.
2.  **Second Query (`./queries/step2_count_waf_actions.json`)**: This step uses the malicious IPs to get a summary of WAF and other security layers actions, quantifying how many additional security events would have been blocked if MUD was in mitigation mode.


**Run the command:**

```bash
node run_query.js ./queries/step1_get_top_malicious_ips.json --drill-down SRC_IP ./queries/step2_count_waf_actions.json --relative 1h
```

#### Use Case 2: Top Namespaces with Malicious Users

A simple aggregation to find which namespaces and virtual hosts have the most malicious user activity. This is useful when running with `NAMESPACE: "system"` in your config.

**Run the command:**

```bash
node run_query.js ./queries/top_vh_namespaces_by_mud.json --relative 7d
```

#### Use Case 3: Top 100s

Another simple aggregation to see top 100 URLs, Users, TLS Fingerprint and etc. are being targeted.

**Run the command:**

```bash
node run_query.js ./queries/top_100.json --relative 1d
```

-----

## ✍️ Writing Your Own Queries

Creating queries is easy. Just make a new `.json` file and follow the structure. Leave the template variables (e.g. {VAR} ) unchanged.

### Query Template Structure

```json
{
  "namespace": "{NAMESPACE}",
  "query": {
    "sec_event_type": "waf_sec_event|malicious_user_sec_event",
    "country": "!~US|CA|AU",
    "vh_name": "{VH_NAME}"
  },
  "aggs": {
    "top_countries": {
      "field_aggregation": {
        "field": "COUNTRY",
        "topk": 50
      }
    }
  }
}
```

### Supported Operators

Prefix your value in the `query` object to use an operator.

  * `=` (optional): Exact match. `"country": "AU"`
  * `=~`: (optional)  regex match. `"country": "US|CA"`
  * `!=`: Not equal to. `"country": "!=AU"`  
  * `!~`: Not regex match. `"country": "!~US|CA"`

Happy investigating\! ✨
