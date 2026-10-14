#!/usr/bin/env python3
"""
WhatsApp Ledger Sender — Local Windows Tally Prime Connector Daemon
Connects to local Tally Prime XML interface, extracts debtor ledgers and reporting data,
reconciles running balances, and securely uploads records to the cloud application.
"""

import sys
import os
import json
import time
import argparse
import logging
import re
import urllib.request
import urllib.error
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("TallyConnector")

def get_base_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

DEFAULT_CONFIG_PATH = os.path.join(get_base_dir(), "config.json")

def load_config(config_path=None):
    path = config_path or DEFAULT_CONFIG_PATH
    if not os.path.exists(path):
        logger.warning(f"Configuration file not found at {path}. Using default settings.")
        return {
            "server_url": "http://localhost:5000",
            "api_key": "",
            "tally_host": "localhost",
            "tally_port": 9000,
            "company_name": "",
            "statement_period": "Current Financial Year",
            "from_date": "20250401",
            "to_date": "20260331",
            "schedule_interval_minutes": 60,
            "auto_sync_on_startup": True
        }
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def parse_xml_tag(xml, tag):
    if not xml:
        return ""
    pattern = re.compile(rf"<{tag}(?:\s+[^>]*)?>([\s\S]*?)<\/{tag}>", re.IGNORECASE)
    match = pattern.search(xml)
    if not match:
        return ""
    content = match.group(1).strip()
    if content.startswith("<![CDATA[") and content.endswith("]]>"):
        content = content[9:-3].strip()
    return content

def parse_xml_blocks(xml, tag):
    if not xml:
        return []
    pattern = re.compile(rf"<{tag}(?:\s+[^>]*)?>([\s\S]*?)<\/{tag}>", re.IGNORECASE)
    return [m.group(1) for m in pattern.finditer(xml)]

def send_tally_xml(host, port, xml_payload, timeout=5):
    url = f"http://{host}:{port}"
    data = xml_payload.encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "text/xml;charset=utf-8",
            "Content-Length": str(len(data))
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.URLError as e:
        raise ConnectionError(f"Cannot connect to Tally Prime at {url}: {e.reason}")

def check_tally_status(host, port):
    xml = """
    <ENVELOPE>
      <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export Data</TALLYREQUEST><TYPE>Collection</TYPE><ID>List of Companies</ID></HEADER>
      <BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="List of Companies"><TYPE>Company</TYPE><FETCH>Name,StartingFrom</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY>
    </ENVELOPE>
    """.strip()
    try:
        resp = send_tally_xml(host, port, xml, timeout=3)
        companies = [parse_xml_tag(b, "NAME") for b in parse_xml_blocks(resp, "COMPANY") if parse_xml_tag(b, "NAME")]
        return {
            "is_online": True,
            "companies": companies,
            "active_company": companies[0] if companies else "No Active Company"
        }
    except Exception as e:
        return {
            "is_online": False,
            "error": str(e),
            "companies": [],
            "active_company": None
        }

def read_tally_ledgers(config, use_synthetic=False):
    if use_synthetic:
        logger.info("Using synthetic test ledger data (simulation mode)...")
        return [
            {
                "name": "Bharat Traders",
                "mobile": "919876543210",
                "email": "accounts@bharattraders.example",
                "address": "Plot 12, Industrial Area, Pune",
                "gstin": "27AABCB1234D1Z5",
                "openingBalance": 25000.0,
                "openingBalanceType": "Dr",
                "closingBalance": 45000.0,
                "balanceType": "Dr",
                "statementPeriod": config.get("statement_period", "01-Apr-2025 to 31-Mar-2026"),
                "transactions": [
                    {"date": "10-Apr-2025", "voucherNo": "INV-001", "type": "Sales", "debit": 30000.0, "credit": 0.0},
                    {"date": "20-Apr-2025", "voucherNo": "RCP-001", "type": "Receipt", "debit": 0.0, "credit": 10000.0}
                ]
            },
            {
                "name": "Shree Ganesh Enterprises",
                "mobile": "919876543211",
                "email": "finance@shreeganesh.example",
                "address": "Shop 4, Market Yard, Mumbai",
                "gstin": "27BBBCB5678D1Z8",
                "openingBalance": 10000.0,
                "openingBalanceType": "Dr",
                "closingBalance": 10000.0,
                "balanceType": "Dr",
                "statementPeriod": config.get("statement_period", "01-Apr-2025 to 31-Mar-2026"),
                "transactions": []
            }
        ]

    host = config.get("tally_host", "localhost")
    port = config.get("tally_port", 9000)
    company = config.get("company_name", "")

    xml = f"""
    <ENVELOPE>
      <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export Data</TALLYREQUEST><TYPE>Collection</TYPE><ID>DebtorsLedgers</ID></HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            {f'<SVCURRENTCOMPANY>{company}</SVCURRENTCOMPANY>' if company else ''}
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="DebtorsLedgers">
                <TYPE>Ledger</TYPE>
                <CHILDOF>$$GroupSundryDebtors</CHILDOF>
                <FETCH>Name,Parent,OpeningBalance,ClosingBalance,Email,LedgerPhone,MobileNo,Address,PartyGSTIN</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>
    """.strip()

    resp = send_tally_xml(host, port, xml)
    ledger_blocks = parse_xml_blocks(resp, "LEDGER")
    ledgers = []

    for block in ledger_blocks:
        name = parse_xml_tag(block, "NAME")
        if not name:
            continue
        mobile = parse_xml_tag(block, "MOBILENO") or parse_xml_tag(block, "LEDGERPHONE") or ""
        email = parse_xml_tag(block, "EMAIL") or ""
        address = parse_xml_tag(block, "ADDRESS") or ""
        gstin = parse_xml_tag(block, "PARTYGSTIN") or ""
        raw_open = parse_xml_tag(block, "OPENINGBALANCE") or "0"
        raw_close = parse_xml_tag(block, "CLOSINGBALANCE") or "0"

        open_bal = abs(float(raw_open)) if raw_open.replace('-', '').replace('.', '').isdigit() else 0.0
        close_bal = abs(float(raw_close)) if raw_close.replace('-', '').replace('.', '').isdigit() else 0.0

        open_type = "Cr" if raw_open.startswith("-") else "Dr"
        close_type = "Cr" if raw_close.startswith("-") else "Dr"

        ledgers.append({
            "name": name,
            "mobile": mobile,
            "email": email,
            "address": address,
            "gstin": gstin,
            "openingBalance": open_bal,
            "openingBalanceType": open_type,
            "closingBalance": close_bal,
            "balanceType": close_type,
            "statementPeriod": config.get("statement_period", "01-Apr-2025 to 31-Mar-2026"),
            "transactions": []
        })

    return ledgers

def upload_to_cloud(config, ledgers, company_name=None):
    server_url = config.get("server_url", "http://localhost:5000").rstrip("/")
    api_key = config.get("api_key", "").strip()

    if not api_key:
        raise ValueError("Missing connector API key. Generate an API key in the portal and configure it in config.json.")

    upload_url = f"{server_url}/api/tally/connector-upload"
    payload = {
        "companyName": company_name or config.get("company_name") or "Primary Company",
        "statementPeriod": config.get("statement_period", "Current Financial Year"),
        "fromDate": config.get("from_date", "20250401"),
        "toDate": config.get("to_date", "20260331"),
        "ledgers": ledgers
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        upload_url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-connector-key": api_key,
            "User-Agent": "DocSender-TallyConnector/2.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            res_body = resp.read().decode("utf-8")
            return json.loads(res_body)
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        try:
            parsed = json.loads(err_msg)
            err_msg = parsed.get("error") or parsed.get("message") or err_msg
        except Exception:
            pass
        raise RuntimeError(f"Cloud upload rejected (HTTP {e.code}): {err_msg}")
    except urllib.error.URLError as e:
        raise ConnectionError(f"Cannot connect to cloud server at {upload_url}: {e.reason}")

def run_sync_cycle(config, use_synthetic=False):
    logger.info("--- Starting Tally Synchronization Cycle ---")
    status = check_tally_status(config.get("tally_host", "localhost"), config.get("tally_port", 9000))

    if not status["is_online"] and not use_synthetic:
        logger.error(f"Tally Prime is offline: {status.get('error')}. Please start Tally Prime and enable ODBC/XML server on port {config.get('tally_port', 9000)}.")
        return False

    company = config.get("company_name") or status.get("active_company") or "Test Company"
    logger.info(f"Connected to Tally Prime. Selected Company: '{company}'")

    ledgers = read_tally_ledgers(config, use_synthetic=use_synthetic)
    logger.info(f"Extracted {len(ledgers)} customer ledgers.")

    try:
        result = upload_to_cloud(config, ledgers, company_name=company)
        logger.info(f"SUCCESS: Uploaded {result.get('totalLedgers')} ledgers. Run ID: {result.get('runId')}. Reconciled: {result.get('reconciledCount')}, Discrepancies: {result.get('discrepancyCount')}")
        return True
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Tally Prime Windows Connector Daemon")
    parser.add_argument("--config", "-c", help="Path to config.json", default=None)
    parser.add_argument("--once", action="store_true", help="Run a single sync cycle and exit")
    parser.add_argument("--status", action="store_true", help="Check local Tally and remote server status and exit")
    parser.add_argument("--demo", action="store_true", help="Run with synthetic test data for offline validation")
    parser.add_argument("--interval", "-i", type=int, help="Override sync interval in minutes")
    args = parser.parse_args()

    config = load_config(args.config)
    if args.interval:
        config["schedule_interval_minutes"] = args.interval

    if args.status:
        print("\n=== Tally Connector Diagnostic Status ===")
        t_status = check_tally_status(config.get("tally_host", "localhost"), config.get("tally_port", 9000))
        print(f"Local Tally: {'ONLINE' if t_status['is_online'] else 'OFFLINE'}")
        if t_status['is_online']:
            print(f"Active Company: {t_status.get('active_company')}")
            print(f"Discovered Companies: {', '.join(t_status.get('companies', []))}")
        else:
            print(f"Error: {t_status.get('error')}")

        print(f"Target Cloud Server: {config.get('server_url')}")
        print(f"Configured API Key: {'[SET]' if config.get('api_key') else '[NOT SET]'}")
        print("=========================================\n")
        sys.exit(0 if t_status['is_online'] else 1)

    if args.once or args.demo:
        success = run_sync_cycle(config, use_synthetic=args.demo)
        sys.exit(0 if success else 1)

    # Daemon mode: run immediately then loop with interval
    logger.info(f"Starting Tally Connector Daemon. Sync interval: {config.get('schedule_interval_minutes', 60)} minute(s).")
    run_sync_cycle(config)

    interval_sec = max(60, config.get("schedule_interval_minutes", 60) * 60)
    try:
        while True:
            time.sleep(interval_sec)
            run_sync_cycle(config)
    except KeyboardInterrupt:
        logger.info("Connector daemon stopped by user.")
        sys.exit(0)

if __name__ == "__main__":
    main()
