# Role Panels

Role panels let members give themselves approved roles from a Discord message. CorePanel supports both button panels and dropdown panels.

## What Role Panels Do

- Show a clean embed with your title, description, color, image, and thumbnail.
- Let members claim roles with buttons or a select menu.
- Optionally remove old roles in the same category.
- Optionally require a role before someone can claim another role.
- Log successful claims, removals, and permission failures.

Role panels replace old reaction-role setups. They use Discord buttons and dropdowns, which gives members private error messages and avoids reaction cache problems.

## Required Permissions

The bot needs:

- **Manage Roles**
- **View Channel**
- **Send Messages**
- **Embed Links**
- **Use External Emojis** if you use custom emoji

The bot's highest role must be above every role it will assign. Discord will not allow any bot to give out roles above itself.

## Create a Button Role Panel

1. Open **Automation > Role Panels**.
2. Enter a **Panel name**. This is for staff only.
3. Choose the **Post channel**.
4. Set **Layout** to **Buttons**.
5. Write the **Discord title** and **Description** members will see.
6. Click **Add role option**.
7. Choose the Discord role.
8. Add a display label, optional emoji, short description, and category.
9. Add more role options as needed.
10. Check the live preview.
11. Click **Save role panel**.
12. In the saved panel library, click **Post**.

Buttons are best for small panels, usually 1 to 10 roles.

## Create a Dropdown Role Panel

1. Open **Automation > Role Panels**.
2. Set **Layout** to **Dropdown menu**.
3. Add up to 25 role options.
4. Use descriptions to explain what each role means.
5. Save and post the panel.

Dropdowns are best when you have more roles or want a cleaner message.

## Role Options

Each role option can include:

- **Discord role:** the role the bot gives or removes.
- **Display label:** the text shown on the button or menu option.
- **Emoji:** a normal emoji or Discord custom emoji.
- **Short description:** shown in dropdown menus.
- **Category:** groups related roles together.
- **Required role:** the member must already have this role before claiming the option.
- **Button style:** neutral, primary, success, or danger for button panels.

Use harmless member roles only. Do not put staff, admin, moderation, or dangerous permission roles in public panels.

## Categories

Categories group related roles, such as:

- `Region`
- `Games`
- `Notifications`
- `Pronouns`

In **Advanced role rules**, you can set a max number of roles per category. You can also enable **Exclusive categories**, which removes the old role in the same category when a member chooses a new one.

Example:

- Category: `Region`
- Max roles per category: `1`
- Exclusive categories: enabled

If a member chooses `NA` and later chooses `EU`, CorePanel removes `NA` and gives `EU`.

## Required Roles

Required roles are useful when a role should only be available to verified members, boosters, or staff-approved members.

You can set:

- A global required role for the whole panel.
- A required role for one specific role option.

If a member does not have the required role, CorePanel sends a private message explaining what they need.

## Add-Only Mode

By default, clicking a role option toggles it:

- No role yet: the bot adds it.
- Already has the role: the bot removes it.

In **Advanced role rules**, set **Click behavior** to **Only add role** if members should not be able to remove the role by clicking again.

## Logs

Role panel logs can include:

- Role panel created
- Role panel updated
- Role panel deleted
- Role panel published
- User claimed a role
- User removed a role
- Claim failed because the bot lacked permission
- Claim failed because the member was missing a required role

Set a panel-specific **Log channel**, or let it fall back to your server mod log channel.

## Troubleshooting

### The Bot Cannot Give a Role

Move the CorePanel role above the role you want it to assign. Also confirm the bot has **Manage Roles**.

### A Role Was Deleted

Open **Automation > Role Panels**, edit the panel, remove the deleted role option, and save again.

### Custom Emoji Does Not Show

Use a normal emoji first. For custom emoji, make sure the bot can access that emoji and has **Use External Emojis** if it comes from another server.

### Dropdown Role Limits Feel Wrong

Discord select menus can show up to 25 options. Category limits are enforced by CorePanel after the member submits the selection.

### Members Cannot See the Panel

Check the post channel permissions. Members need **View Channel**, and the bot needs **Send Messages** and **Embed Links**.
