import asyncio
import sys

import httpx

try:
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
except Exception:
    pass

API_BASE = "http://localhost:8000/api/v1"


async def run_notification_tests():
    print("==================================================")
    print("🚀 STARTING DRIVER NOTIFICATION SYSTEM E2E TESTS")
    print("==================================================")

    async with httpx.AsyncClient(timeout=30.0) as client:
        # -------------------------------------------------------------------
        # 0. Authentication
        # -------------------------------------------------------------------
        print("\n🔑 Step 0: Authenticating Officer and Driver accounts...")

        # Driver login
        driver_auth_res = await client.post(
            f"{API_BASE}/auth/login",
            json={"email": "driver@wastewise.gov", "password": "password123"},
        )
        assert (
            driver_auth_res.status_code == 200
        ), f"Driver login failed: {driver_auth_res.text}"
        driver_token = driver_auth_res.json()["access_token"]
        driver_headers = {"Authorization": f"Bearer {driver_token}"}
        print("   ✅ Driver authenticated successfully.")

        # Officer login
        officer_auth_res = await client.post(
            f"{API_BASE}/auth/login",
            json={"email": "officer@wastewise.gov", "password": "password123"},
        )
        assert (
            officer_auth_res.status_code == 200
        ), f"Officer login failed: {officer_auth_res.text}"
        officer_token = officer_auth_res.json()["access_token"]
        officer_headers = {"Authorization": f"Bearer {officer_token}"}
        print("   ✅ Officer authenticated successfully.")

        # Get driver profile
        driver_me_res = await client.get(f"{API_BASE}/auth/me", headers=driver_headers)
        driver_user = driver_me_res.json()
        driver_id = (
            driver_user.get("sub")
            or driver_user.get("user_id")
            or driver_user.get("id")
        )
        print(f"   👤 Driver ID: {driver_id}, Email: {driver_user.get('email')}")

        # -------------------------------------------------------------------
        # TEST 1 & 2: Officer Assigns Incidents (Normal P2 and Critical P0/P1)
        # -------------------------------------------------------------------
        print(
            "\n🧪 TEST 1 & 2: Incident Assignment Notifications (Standard & P0 Critical)..."
        )

        # 1. Create a test standard incident via report
        inc1_res = await client.post(
            f"{API_BASE}/reports",
            json={
                "description": "Vegetable waste pile spilling into road.",
                "category": "organic",
                "latitude": 23.0251,
                "longitude": 72.5781,
                "address_text": "Sector 11 Market, Gandhinagar",
                "estimated_volume_m3": 2.5,
                "severity_score": 0.5,
            },
            headers=officer_headers,
        )
        assert inc1_res.status_code == 201, f"Create report failed: {inc1_res.text}"
        rep1 = inc1_res.json()
        inc1_id = rep1["incident_id"]
        print(f"   📌 Created Standard Incident from Report: ({inc1_id})")

        # Assign to Driver
        assign1_res = await client.patch(
            f"{API_BASE}/incidents/{inc1_id}",
            json={
                "assigned_driver_id": driver_id,
                "priority": "P2",
                "status": "ASSIGNED",
            },
            headers=officer_headers,
        )
        assert assign1_res.status_code == 200, f"Assign failed: {assign1_res.text}"
        print("   ✅ Incident assigned to Driver.")

        # 2. Create and assign a P0 Critical Emergency Incident
        inc2_res = await client.post(
            f"{API_BASE}/reports",
            json={
                "description": "Corrosive solvent leaking near emergency entrance.",
                "category": "hazardous",
                "latitude": 23.0331,
                "longitude": 72.5861,
                "address_text": "Sector 12 Civil Hospital, Gandhinagar",
                "estimated_volume_m3": 1.2,
                "severity_score": 0.95,
            },
            headers=officer_headers,
        )
        assert inc2_res.status_code == 201, f"Create P0 report failed: {inc2_res.text}"
        rep2 = inc2_res.json()
        inc2_id = rep2["incident_id"]
        print(f"   🚨 Created Critical Incident from Report: ({inc2_id})")

        # Assign P0 to Driver
        assign2_res = await client.patch(
            f"{API_BASE}/incidents/{inc2_id}",
            json={
                "assigned_driver_id": driver_id,
                "priority": "P0",
                "status": "ASSIGNED",
            },
            headers=officer_headers,
        )
        assert assign2_res.status_code == 200, f"Assign P0 failed: {assign2_res.text}"
        print("   ✅ Critical P0 Incident assigned to Driver.")

        # -------------------------------------------------------------------
        # Verify Driver Received Notifications
        # -------------------------------------------------------------------
        print("\n📬 Verifying Driver Notification Feed...")
        driver_notifs_res = await client.get(
            f"{API_BASE}/notifications?limit=10",
            headers=driver_headers,
        )
        assert (
            driver_notifs_res.status_code == 200
        ), f"Failed to get notifications: {driver_notifs_res.text}"
        notifs_data = driver_notifs_res.json()
        items = notifs_data["items"]
        print(
            f"   ✅ Driver has {notifs_data['unread_count']} unread notifications (Total: {notifs_data['total_count']})"
        )
        assert len(items) >= 2, "Expected at least 2 notifications for Driver"

        # Check top notification is P0 critical
        p0_notif = next((n for n in items if n["incident_id"] == inc2_id), None)
        assert p0_notif is not None, "Critical P0 notification not found in driver feed"
        print(
            f"   ✅ Verified Critical Notification: '{p0_notif['title']}' (Priority: {p0_notif['priority']})"
        )

        p2_notif = next((n for n in items if n["incident_id"] == inc1_id), None)
        assert p2_notif is not None, "Standard assignment notification not found"
        print(
            f"   ✅ Verified Standard Notification: '{p2_notif['title']}' (Priority: {p2_notif['priority']})"
        )

        # -------------------------------------------------------------------
        # TEST 3: Route Update Notification
        # -------------------------------------------------------------------
        print("\n🧪 TEST 3: Dynamic Route Update Trigger...")
        reroute_res = await client.post(
            f"{API_BASE}/optimization/simulate-p0-emergency",
            headers=officer_headers,
        )
        assert reroute_res.status_code == 200, f"Simulate P0 failed: {reroute_res.text}"
        print("   ✅ Loop C dynamic rerouting executed.")

        # Verify Driver received route update notification
        driver_notifs_res = await client.get(
            f"{API_BASE}/notifications?limit=10", headers=driver_headers
        )
        route_notif = next(
            (
                n
                for n in driver_notifs_res.json()["items"]
                if n["notification_type"] == "ROUTE_UPDATED"
            ),
            None,
        )
        assert route_notif is not None, "Route updated notification not found"
        print(
            f"   ✅ Verified Route Updated Notification: '{route_notif['title']}' — '{route_notif['message']}'"
        )

        # -------------------------------------------------------------------
        # TEST 4: Driver Starts Collection -> Officer Notification
        # -------------------------------------------------------------------
        print("\n🧪 TEST 4: Driver Starts Collection...")
        start_res = await client.post(
            f"{API_BASE}/incidents/{inc1_id}/start",
            headers=driver_headers,
        )
        assert (
            start_res.status_code == 200
        ), f"Start collection failed: {start_res.text}"
        print(f"   ✅ Collection started for {inc1_id}.")

        # Check Officer notifications
        officer_notifs_res = await client.get(
            f"{API_BASE}/notifications?limit=10", headers=officer_headers
        )
        start_notif = next(
            (
                n
                for n in officer_notifs_res.json()["items"]
                if n["notification_type"] == "COLLECTION_STARTED"
                and str(n.get("incident_id")) == str(inc1_id)
            ),
            None,
        )
        assert (
            start_notif is not None
        ), "Officer did not receive COLLECTION_STARTED notification"
        print(
            f"   ✅ Officer received notification: '{start_notif['title']}' — '{start_notif['message']}'"
        )

        # -------------------------------------------------------------------
        # TEST 5: Driver Uploads Proof of Work -> Officer Notification
        # -------------------------------------------------------------------
        print("\n🧪 TEST 5: Driver Uploads Proof of Work...")
        # Small sample valid 1x1 PNG image
        sample_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        files = {"file": ("proof_sector11.png", sample_png, "image/png")}
        data = {
            "latitude": "23.025",
            "longitude": "72.578",
            "notes": "Thoroughly cleaned and disinfected.",
        }

        proof_res = await client.post(
            f"{API_BASE}/incidents/{inc1_id}/proof",
            files=files,
            data=data,
            headers=driver_headers,
        )
        assert proof_res.status_code == 200, f"Proof upload failed: {proof_res.text}"
        proof_obj = proof_res.json()
        print(
            f"   ✅ Proof uploaded successfully (Verification status: {proof_obj['verification_status']})."
        )

        # Complete collection
        complete_res = await client.patch(
            f"{API_BASE}/incidents/{inc1_id}/complete",
            json={"latitude": 23.025, "longitude": 72.578},
            headers=driver_headers,
        )
        assert (
            complete_res.status_code == 200
        ), f"Complete collection failed: {complete_res.text}"
        print("   ✅ Collection marked COMPLETE by Driver.")

        # Check Officer notifications for Proof Submission & Completion
        officer_notifs_res = await client.get(
            f"{API_BASE}/notifications?limit=10", headers=officer_headers
        )
        officer_items = officer_notifs_res.json()["items"]
        proof_sub_notif = next(
            (
                n
                for n in officer_items
                if n["notification_type"] == "PROOF_SUBMITTED"
                and str(n.get("incident_id")) == str(inc1_id)
            ),
            None,
        )
        assert (
            proof_sub_notif is not None
        ), "Officer did not receive PROOF_SUBMITTED notification"
        print(
            f"   ✅ Officer received notification: '{proof_sub_notif['title']}' — '{proof_sub_notif['message']}'"
        )

        # -------------------------------------------------------------------
        # TEST 6: Officer Verifies Proof -> Driver Notification
        # -------------------------------------------------------------------
        print("\n🧪 TEST 6: Officer Verifies Proof of Work...")
        verify_res = await client.post(
            f"{API_BASE}/incidents/{inc1_id}/verify-proof",
            json={"notes": "Excellent clearance. GPS verified on site."},
            headers=officer_headers,
        )
        assert verify_res.status_code == 200, f"Verify proof failed: {verify_res.text}"
        print("   ✅ Officer verified driver collection proof.")

        # Verify Driver received PROOF_VERIFIED notification
        driver_notifs_res = await client.get(
            f"{API_BASE}/notifications?limit=10", headers=driver_headers
        )
        driver_items = driver_notifs_res.json()["items"]
        verified_notif = next(
            (
                n
                for n in driver_items
                if n["notification_type"] == "PROOF_VERIFIED"
                and str(n.get("incident_id")) == str(inc1_id)
            ),
            None,
        )
        assert (
            verified_notif is not None
        ), "Driver did not receive PROOF_VERIFIED notification"
        print(
            f"   ✅ Driver received notification: '{verified_notif['title']}' — '{verified_notif['message']}'"
        )

        # -------------------------------------------------------------------
        # TEST 7: Officer Rejects Proof -> Driver Notification
        # -------------------------------------------------------------------
        print("\n🧪 TEST 7: Officer Rejects Proof with Reason...")
        # Upload a proof for inc2
        files2 = {"file": ("proof_sector12.png", sample_png, "image/png")}
        await client.post(
            f"{API_BASE}/incidents/{inc2_id}/proof",
            files=files2,
            data={"latitude": "23.033", "longitude": "72.586", "notes": "First pass"},
            headers=driver_headers,
        )

        reject_res = await client.post(
            f"{API_BASE}/incidents/{inc2_id}/reject-proof",
            json={
                "reason": "Secondary spillage remaining near drainage gate",
                "notes": "Please clear 5m perimeter",
            },
            headers=officer_headers,
        )
        assert reject_res.status_code == 200, f"Reject proof failed: {reject_res.text}"
        print("   ✅ Officer rejected proof with mandatory reason.")

        # Verify Driver received PROOF_REJECTED notification
        driver_notifs_res = await client.get(
            f"{API_BASE}/notifications?limit=10", headers=driver_headers
        )
        rejected_notif = next(
            (
                n
                for n in driver_notifs_res.json()["items"]
                if n["notification_type"] == "PROOF_REJECTED"
                and str(n.get("incident_id")) == str(inc2_id)
            ),
            None,
        )
        assert (
            rejected_notif is not None
        ), "Driver did not receive PROOF_REJECTED notification"
        print(
            f"   ✅ Driver received notification: '{rejected_notif['title']}' — '{rejected_notif['message']}'"
        )

        # -------------------------------------------------------------------
        # TEST 8: Read State Management (Individual Read & Mark All Read)
        # -------------------------------------------------------------------
        print("\n🧪 TEST 8: Read / Unread State Persistence...")
        unread_cnt_before = (
            await client.get(
                f"{API_BASE}/notifications/unread-count", headers=driver_headers
            )
        ).json()["count"]
        print(f"   📊 Unread count before read: {unread_cnt_before}")
        assert unread_cnt_before > 0

        # Mark 1 notification read
        target_notif_id = driver_items[0]["id"]
        read_single_res = await client.patch(
            f"{API_BASE}/notifications/{target_notif_id}/read",
            headers=driver_headers,
        )
        assert read_single_res.status_code == 200
        assert read_single_res.json()["is_read"] is True

        unread_cnt_after = (
            await client.get(
                f"{API_BASE}/notifications/unread-count", headers=driver_headers
            )
        ).json()["count"]
        print(f"   📊 Unread count after reading 1 item: {unread_cnt_after}")
        assert unread_cnt_after == unread_cnt_before - 1

        # Mark all read
        mark_all_res = await client.post(
            f"{API_BASE}/notifications/read-all", headers=driver_headers
        )
        assert mark_all_res.status_code == 200

        unread_cnt_final = (
            await client.get(
                f"{API_BASE}/notifications/unread-count", headers=driver_headers
            )
        ).json()["count"]
        print(f"   📊 Unread count after Mark All Read: {unread_cnt_final}")
        assert unread_cnt_final == 0

        # -------------------------------------------------------------------
        # TEST 9: Driver-Specific Isolation & Security
        # -------------------------------------------------------------------
        print("\n🧪 TEST 9: Driver Security & Isolation...")
        # Officer should not see Driver's private notifications in their own feed
        officer_feed = (
            await client.get(f"{API_BASE}/notifications", headers=officer_headers)
        ).json()["items"]
        officer_user_ids = {n["user_id"] for n in officer_feed}
        assert (
            str(driver_id) not in officer_user_ids
        ), "Security breach: Officer feed contains Driver notifications"

        driver_feed = (
            await client.get(f"{API_BASE}/notifications", headers=driver_headers)
        ).json()["items"]
        for n in driver_feed:
            assert n["user_id"] == str(
                driver_id
            ), f"Security breach: Driver feed contains notification for {n['user_id']}"

        print(
            "   ✅ Strict user isolation verified. Driver A cannot see Driver B or Officer notifications."
        )

    print("\n==================================================")
    print("🎉 ALL 9 NOTIFICATION SYSTEM E2E TESTS PASSED 100%!")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(run_notification_tests())
