using Interact3D.Models;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Reflection.Emit;

namespace Interact3D.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<tbl_User> tbl_User => Set<tbl_User>();
    public DbSet<tbl_Model3D> tbl_Model3D => Set<tbl_Model3D>();
    public DbSet<tbl_ModelPosition> tbl_ModelPosition => Set<tbl_ModelPosition>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // tbl_User: Unique Username
        modelBuilder.Entity<tbl_User>(entity =>
        {
            entity.HasIndex(e => e.Username).IsUnique();
        });

        // tbl_Model3D: Quan hệ với User
        modelBuilder.Entity<tbl_Model3D>(entity =>
        {
            entity.HasOne(m => m.User)
                  .WithMany(u => u.Models)
                  .HasForeignKey(m => m.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // tbl_ModelPosition: Tránh lỗi Multiple Cascade Paths (Msg 1785)
        modelBuilder.Entity<tbl_ModelPosition>(entity =>
        {
            entity.HasIndex(p => new { p.UserId, p.ModelId }).IsUnique();

            entity.HasOne(p => p.User)
                  .WithMany(u => u.Positions)
                  .HasForeignKey(p => p.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(p => p.Model)
                  .WithMany(m => m.Positions)
                  .HasForeignKey(p => p.ModelId)
                  .OnDelete(DeleteBehavior.Restrict);
        });
    }
}