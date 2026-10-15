"""Seed realistic dummy data for the admin/superadmin walkthrough."""

import random
import uuid
from datetime import datetime, timedelta

from agents_core.models import (
    Announcement,
    AuditLog,
    Chat,
    LLMModel,
    Message,
    MessageRole,
    Plan,
    Role,
    ScheduledTask,
    ScheduledTaskRun,
    Subscription,
    SubscriptionStatus,
    Team,
    TeamInvite,
    TeamMember,
    TeamRole,
    TokenUsage,
    User,
    db,
)
from agents_core.utils.auth import hash_password
from demo_server import create_demo_app

random.seed(7)
NOW = datetime.utcnow()
PASSWORD = hash_password("demo-pass-123")

MODELS = [
    ("Claude Sonnet 4.5", "anthropic", "claude-sonnet-4-5", 3.0, 15.0, True),
    ("GPT-4o", "openai", "gpt-4o", 2.5, 10.0, True),
    ("Gemini 2.5 Pro", "google", "gemini-2.5-pro", 1.25, 10.0, True),
    ("Llama 3.3 70B", "groq", "llama-3.3-70b", 0.59, 0.79, True),
    ("Mistral Large", "mistral", "mistral-large", 2.0, 6.0, True),
    ("GPT-4o mini", "openai", "gpt-4o-mini", 0.15, 0.6, False),
]

FIRST_NAMES = [
    "Ava",
    "Liam",
    "Noah",
    "Emma",
    "Olivia",
    "Ethan",
    "Sophia",
    "Lucas",
    "Mia",
    "Arjun",
    "Priya",
    "Kenji",
    "Sara",
    "Diego",
    "Lena",
    "Omar",
    "Zoe",
    "Ravi",
    "Nina",
    "Tom",
    "Ines",
    "Felix",
    "Hana",
    "Leo",
]

LAST_NAMES = ["Park", "Silva", "Novak", "Ito", "Ali"]

CLIENTS = [
    {
        "name": "Acme Legal",
        "domain": "acmelegal.com",
        "owner": ("Maya Chen", "maya"),
        "members": 6,
        "plan": ("PRO", "ACTIVE"),
        "seat_limit": 10,
        "budget": 60.0,
        "daily_spend": 3.4,
        "verified": True,
        "retention": 365,
        "notes": "Annual contract. Champion: Maya. Renewal in March.",
    },
    {
        "name": "Northwind Capital",
        "domain": "northwind.com",
        "owner": ("James Whitfield", "james"),
        "members": 11,
        "plan": ("ENTERPRISE", "ACTIVE"),
        "seat_limit": 25,
        "budget": None,
        "daily_spend": 9.0,
        "spike": 6.0,
        "verified": True,
    },
    {
        "name": "Initech Advisory",
        "domain": "initech.io",
        "owner": ("Bill Lumbergh", "bill"),
        "members": 3,
        "plan": ("PRO", "TRIALING"),
        "seat_limit": 5,
        "budget": 50.0,
        "daily_spend": 0.9,
    },
    {
        "name": "Globex Compliance",
        "domain": "globex.co",
        "owner": ("Hank Scorpio", "hank"),
        "members": 4,
        "plan": None,
        "daily_spend": 1.6,
        "suspended": True,
        "notes": "Suspended 3 Oct — invoice 90 days overdue.",
    },
    {
        "name": "Umbrella Partners",
        "domain": "umbrella.co",
        "owner": ("Alice Abernathy", "alice"),
        "members": 2,
        "plan": ("PRO", "CANCELED"),
        "daily_spend": 0.4,
    },
    {
        "name": "Hooli Labs",
        "domain": "hooli.xyz",
        "owner": ("Gavin Belson", "gavin"),
        "members": 1,
        "plan": None,
        "daily_spend": 0.25,
    },
]


def make_user(name, email, role=Role.USER, days_ago=None, verified=True):
    user = User(
        email=email,
        name=name,
        password=PASSWORD,
        role=role,
        email_verified=verified,
        created_at=NOW - timedelta(days=days_ago or random.randint(5, 120)),
        last_login_at=NOW - timedelta(hours=random.randint(1, 24 * 20)),
    )
    db.session.add(user)
    return user


def add_usage(models, user, team_id, day, spend_target):
    """Spread roughly spend_target dollars over a few messages on a day."""
    remaining = spend_target
    while remaining > 0.01:
        model = random.choices(models, weights=[5, 3, 2, 2, 1])[0]
        input_tokens = random.randint(2_000, 40_000)
        output_tokens = random.randint(300, 4_000)
        input_cost = input_tokens / 1e6 * model.input_cost
        output_cost = output_tokens / 1e6 * model.output_cost
        db.session.add(
            TokenUsage(
                user_id=user.id,
                team_id=team_id,
                model_id=model.id,
                model_name=model.name,
                provider=model.provider,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                input_cost_usd=input_cost,
                output_cost_usd=output_cost,
                total_cost_usd=input_cost + output_cost,
                created_at=day + timedelta(minutes=random.randint(0, 600)),
            )
        )
        remaining -= input_cost + output_cost


def seed():
    models = []
    for name, provider, model_id, input_cost, output_cost, active in MODELS:
        model = LLMModel(
            name=name,
            provider=provider,
            model_id=model_id,
            input_cost=input_cost,
            output_cost=output_cost,
            is_active=active,
            context_window=200_000,
        )
        db.session.add(model)
        models.append(model)
    db.session.flush()
    active_models = [model for model in models if model.is_active]

    root = make_user("Pranav (Vivexy)", "root@vivexy.com", Role.SUPER_ADMIN, 400)
    make_user("Support Desk", "support@vivexy.com", Role.ADMIN, 200)
    db.session.flush()

    name_pool = iter(random.sample(FIRST_NAMES, len(FIRST_NAMES)))
    for client in CLIENTS:
        owner_name, owner_handle = client["owner"]
        owner = make_user(owner_name, f"{owner_handle}@{client['domain']}")
        db.session.flush()
        team = Team(
            name=client["name"],
            slug=client["name"].lower().replace(" ", "-"),
            owner_id=owner.id,
            seat_limit=client.get("seat_limit"),
            monthly_budget_usd=client.get("budget"),
            is_suspended=client.get("suspended", False),
            notes=client.get("notes"),
            email_domain=client["domain"],
            domain_verified=client.get("verified", False),
            auto_join_domain=client.get("verified", False),
            retention_days=client.get("retention"),
            created_at=NOW - timedelta(days=random.randint(40, 200)),
        )
        db.session.add(team)
        db.session.flush()
        client["team"] = team
        members = [owner]
        db.session.add(
            TeamMember(user_id=owner.id, team_id=team.id, role=TeamRole.OWNER)
        )
        for index in range(client["members"] - 1):
            first_name = next(name_pool, None) or f"User{index}"
            member = make_user(
                f"{first_name} {random.choice(LAST_NAMES)}",
                f"{first_name.lower()}.{index}@{client['domain']}",
            )
            db.session.flush()
            db.session.add(
                TeamMember(
                    user_id=member.id,
                    team_id=team.id,
                    role=TeamRole.ADMIN if index == 0 else TeamRole.MEMBER,
                    joined_at=NOW - timedelta(days=random.randint(3, 90)),
                )
            )
            members.append(member)

        if client["plan"]:
            plan, status = client["plan"]
            db.session.add(
                Subscription(
                    team_id=team.id,
                    user_id=owner.id,
                    stripe_subscription_id=f"manual_{uuid.uuid4()}",
                    plan=Plan(plan),
                    status=SubscriptionStatus(status),
                    current_period_start=NOW - timedelta(days=20),
                    current_period_end=(
                        NOW + timedelta(days=9) if status == "TRIALING" else None
                    ),
                    updated_at=NOW - timedelta(days=6),
                )
            )

        for days_ago in range(60, -1, -1):
            day = (NOW - timedelta(days=days_ago)).replace(
                hour=8, minute=0, second=0, microsecond=0
            )
            weekday_factor = 0.35 if day.weekday() >= 5 else 1.0
            daily_spend = (
                client["daily_spend"] * weekday_factor * random.uniform(0.6, 1.4)
            )
            if days_ago == 0 and client.get("spike"):
                daily_spend = client["daily_spend"] * client["spike"]
            if client.get("suspended") and days_ago < 12:
                continue
            active_members = random.sample(members, max(1, len(members) * 2 // 3))
            for member in active_members:
                add_usage(
                    active_models,
                    member,
                    team.id,
                    day,
                    daily_spend / len(active_members),
                )

        for member in members[:3]:
            for chat_index in range(random.randint(2, 5)):
                chat = Chat(
                    user_id=member.id,
                    team_id=team.id,
                    title=f"Matter review #{random.randint(100, 999)}",
                    created_at=NOW - timedelta(days=random.randint(0, 50)),
                )
                db.session.add(chat)
                db.session.flush()
                for message_index in range(random.randint(4, 12)):
                    db.session.add(
                        Message(
                            chat_id=chat.id,
                            role=(
                                MessageRole.USER
                                if message_index % 2 == 0
                                else MessageRole.ASSISTANT
                            ),
                            content="Demo message",
                        )
                    )

    acme = CLIENTS[0]["team"]
    acme_owner = User.query.filter_by(email="maya@acmelegal.com").one()
    for email, days in (
        ("daniel@acmelegal.com", 6),
        ("contract.reviewer@freelance.dev", 3),
        ("old.invite@acmelegal.com", -2),
    ):
        db.session.add(
            TeamInvite(
                email=email,
                token=str(uuid.uuid4()),
                team_id=acme.id,
                invited_by=acme_owner.id,
                expires_at=NOW + timedelta(days=days),
                created_at=NOW - timedelta(days=7 - days),
            )
        )

    for index in range(8):
        solo = make_user(
            f"Solo User {index}",
            f"solo{index}@gmail.com",
            days_ago=random.randint(1, 30),
        )
        db.session.flush()
        for days_ago in range(0, 20, 3):
            add_usage(
                active_models,
                solo,
                None,
                NOW - timedelta(days=days_ago),
                random.uniform(0.05, 0.4),
            )

    northwind_admin = (
        TeamMember.query.filter_by(team_id=CLIENTS[1]["team"].id, role=TeamRole.ADMIN)
        .first()
        .user
    )
    task = ScheduledTask(
        user_id=northwind_admin.id,
        name="Daily portfolio risk digest",
        prompt="Summarize overnight risk events for the portfolio",
        schedule_type="cron",
        cron_expression="0 7 * * *",
        timezone="UTC",
        is_active=True,
    )
    db.session.add(task)
    db.session.flush()
    for hours_ago in range(1, 24, 4):
        db.session.add(
            ScheduledTaskRun(
                task_id=task.id,
                status="failed",
                error="RateLimitError: provider returned 429 Too Many Requests",
                ran_at=NOW - timedelta(hours=hours_ago),
            )
        )
    for days_ago in range(2, 6):
        db.session.add(
            ScheduledTaskRun(
                task_id=task.id,
                status="completed",
                ran_at=NOW - timedelta(days=days_ago),
                completed_at=NOW - timedelta(days=days_ago) + timedelta(minutes=2),
            )
        )

    history = [
        (
            acme_owner,
            "team.member_role_changed",
            acme.id,
            {"email": "ava.0@acmelegal.com", "from": "MEMBER", "to": "ADMIN"},
            12,
        ),
        (
            acme_owner,
            "team.settings_updated",
            acme.id,
            {"monthlyBudgetUsd": {"from": 80, "to": 120}},
            9,
        ),
        (
            root,
            "superadmin.client_updated",
            CLIENTS[3]["team"].id,
            {"is_suspended": {"from": False, "to": True}},
            12,
        ),
        (
            root,
            "superadmin.client_plan_changed",
            CLIENTS[2]["team"].id,
            {"plan": {"from": "FREE", "to": "PRO"}, "status": "TRIALING"},
            5,
        ),
    ]
    for actor, action, team_id, details, days_ago in history:
        db.session.add(
            AuditLog(
                actor_id=actor.id,
                actor_email=actor.email,
                action=action,
                target_type="team",
                target_id=team_id,
                team_id=team_id,
                details=details,
                ip_address="203.0.113.10",
                created_at=NOW - timedelta(days=days_ago),
            )
        )

    db.session.add(
        Announcement(
            title="Claude Sonnet 4.5 is now available",
            body="Pick it from the model menu in any chat.",
            level="info",
            created_by=root.id,
            created_at=NOW - timedelta(days=2),
        )
    )
    db.session.commit()
    print(
        f"Seeded {User.query.count()} users, {Team.query.count()} clients, "
        f"{TokenUsage.query.count()} usage rows, {Message.query.count()} messages"
    )


if __name__ == "__main__":
    with create_demo_app().app_context():
        seed()
